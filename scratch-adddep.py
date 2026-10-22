import json,sys,collections
pkg,dep=sys.argv[1],sys.argv[2]
path=f'packages/ts/{pkg}/package.json'
p=json.load(open(path),object_pairs_hook=collections.OrderedDict)
out=collections.OrderedDict()
for k,v in p.items():
    if k in('peerDependencies','devDependencies') and 'dependencies' not in out and 'dependencies' not in p:
        out['dependencies']={dep:'workspace:^'}
    out[k]=v
if 'dependencies' in p:
    out=p; out['dependencies'][dep]='workspace:^'
json.dump(out,open(path,'w'),indent=2); open(path,'a').write('\n')
