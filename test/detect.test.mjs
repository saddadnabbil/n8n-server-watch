// Runs the "Detect changes" Code node from the workflow file against mocked n8n inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../workflows/server-watch.json', import.meta.url)));
const code = workflow.nodes.find((n) => n.name === 'Detect changes').parameters.jsCode;
const detect = new Function('$', '$input', '$getWorkflowStaticData', `return (() => {\n${code}\n})();`);

const target = { name: 'hris', url: 'https://hris.example.com', host: 'hris.example.com' };
const dnsAnswer = (...ips) => ({ Status: 0, Answer: ips.map((data) => ({ type: 1, data })) });

function run(state, { status, error, ips }) {
  const nodes = {
    Targets: [{ json: target }],
    Check: [{ json: status ? { statusCode: status } : { error: { message: error } } }],
  };
  const $ = (name) => ({ all: () => nodes[name] });
  const $input = { all: () => [{ json: dnsAnswer(...ips) }] };
  return detect($, $input, () => state);
}

const events = (out) => (out[0] ? out[0].json.alerts.map((a) => a.event) : []);

test('first healthy run only records a baseline', () => {
  const state = {};
  assert.deepEqual(events(run(state, { status: 200, ips: ['10.0.0.1'] })), []);
  assert.equal(state.targets.hris.up, true);
});

test('alerts once on DOWN, then once on RECOVERED', () => {
  const state = {};
  run(state, { status: 200, ips: ['10.0.0.1'] });
  assert.deepEqual(events(run(state, { error: 'ECONNREFUSED', ips: ['10.0.0.1'] })), ['DOWN']);
  assert.deepEqual(events(run(state, { error: 'ECONNREFUSED', ips: ['10.0.0.1'] })), []);
  assert.deepEqual(events(run(state, { status: 200, ips: ['10.0.0.1'] })), ['RECOVERED']);
});

test('treats 5xx as down', () => {
  const state = {};
  run(state, { status: 200, ips: ['10.0.0.1'] });
  assert.deepEqual(events(run(state, { status: 502, ips: ['10.0.0.1'] })), ['DOWN']);
});

test('alerts when the DNS A record changes', () => {
  const state = {};
  run(state, { status: 200, ips: ['10.0.0.1'] });
  const out = run(state, { status: 200, ips: ['10.0.0.9'] });
  assert.deepEqual(events(out), ['IP_CHANGED']);
  assert.match(out[0].json.text, /10\.0\.0\.1 -> 10\.0\.0\.9/);
});

test('keeps the last known IPs when DNS lookup fails', () => {
  const state = {};
  run(state, { status: 200, ips: ['10.0.0.1'] });
  assert.deepEqual(events(run(state, { status: 200, ips: [] })), []);
  assert.deepEqual(state.targets.hris.ips, ['10.0.0.1']);
});
