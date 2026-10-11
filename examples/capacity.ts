const args = process.argv.slice(2), input: Record<string,number> = {};
const names = ['rps','cpu-ms','response-bytes','utilization','model-share','model-seconds','tokens'];
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].replace(/^--/,''); const value = Number(args[i+1]);
  if (!names.includes(name) || !Number.isFinite(value) || value < 0) throw new Error('Invalid sizing input: ' + name);
  input[name] = value;
}
for (const name of ['rps','cpu-ms','response-bytes']) if (input[name] === undefined) throw new Error('Required --' + name);
const utilization = input.utilization ?? 0.6;
if (utilization <= 0 || utilization > 1 || (input['model-share'] ?? 0) > 1) throw new Error('Ratios must be within 0..1');
const modelRps = input.rps * (input['model-share'] ?? 0);
console.log(JSON.stringify({ assumptions: input, targetUtilization: utilization,
  estimatedCpuCoresLowerBound: Math.ceil(input.rps * input['cpu-ms'] / 1000 / utilization),
  outboundMbps: input.rps * input['response-bytes'] * 8 / 1e6,
  outboundGBPer30Days: input.rps * input['response-bytes'] * 30 * 86400 / 1e9,
  modelConcurrency: input['model-seconds'] === undefined ? null : modelRps * input['model-seconds'],
  modelTokensPerSecond: input.tokens === undefined ? null : modelRps * input.tokens,
  memoryGB: null, gpu: null, warning: 'Input assumptions, not measured capacity. Add indexing, persistence, peak traffic and backup budgets.' },null,2));
