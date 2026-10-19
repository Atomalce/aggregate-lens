import {analyze,sqlFor} from './core.js';
let text='';for await(const chunk of process.stdin)text+=chunk;
process.stdout.write(JSON.stringify(JSON.parse(text).map(d=>({analysis:analyze(d.orders,d.refunds),sql:Object.fromEntries(['naive','distinct','preaggregate'].map(m=>[m,sqlFor(m)]))}))));
