import json
import random
import sqlite3
import subprocess
from pathlib import Path

cases=[]
for n in range(6):
    for m in range(6):
        for duplicate in [False,True]:
            def make(count,start,unit):
                return [{'id':start+i,'cents':unit*(1 if duplicate and i==1 else i+1)} for i in range(count)]
            cases.append({'orders':make(n,101,10000),'refunds':make(m,201,1000)})
rng=random.Random(20261020)
for _ in range(30):
    cases.append({key:[{'id':i+1,'cents':rng.choice([0,100,100,250,100000000])} for i in range(rng.randrange(7))] for key in ['orders','refunds']})
result=subprocess.run(['node','differential.mjs'],cwd=Path(__file__).parent,input=json.dumps(cases),capture_output=True,text=True,encoding='utf-8',check=True)
checks=0
for case,out in zip(cases,json.loads(result.stdout),strict=True):
    db=sqlite3.connect(':memory:')
    db.executescript("CREATE TABLE customers(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO customers VALUES(1,'小林');CREATE TABLE orders(id INTEGER PRIMARY KEY,customer_id INTEGER,amount_cents INTEGER NOT NULL);CREATE TABLE refunds(id INTEGER PRIMARY KEY,customer_id INTEGER,amount_cents INTEGER NOT NULL);")
    for key in ['orders','refunds']:
        db.executemany(f'INSERT INTO {key} VALUES(:id,1,:cents)',case[key])
    for mode,sql in out['sql'].items():
        expected=db.execute(sql).fetchone()
        actual=out['analysis'][mode]
        assert expected==(actual['orders'],actual['refunds']),(case,mode,expected,actual)
        checks+=1
    rows=db.execute('SELECT o.id,o.amount_cents,r.id,r.amount_cents FROM customers c LEFT JOIN orders o ON o.customer_id=c.id LEFT JOIN refunds r ON r.customer_id=c.id WHERE c.id=1 ORDER BY o.id,r.id').fetchall()
    actual=[tuple(r[k] for k in ['orderId','orderCents','refundId','refundCents']) for r in out['analysis']['rows']]
    assert actual==rows,(case,actual,rows)
    db.close()
print(f'PASS: {len(cases)} datasets; {checks} SQLite sum comparisons; {len(cases)} expanded-row comparisons; SQLite {sqlite3.sqlite_version}')
