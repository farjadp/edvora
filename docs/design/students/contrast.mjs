const L=h=>{const c=h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
const cr=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
const themes={
 light:{bg:'#f7f3e8',surface:'#fdfbf5',sunken:'#efe9d9',wash:'#e1f1eb',ink:'#123c55',muted:'#47606f',brand:'#123c55',brandInk:'#f7f3e8',brandText:'#0b6a65',accent:'#40b5ad',accentInk:'#123c55',focus:'#123c55',lineStrong:'#73848a',ok:'#1b7449',danger:'#ae2f25',ms:'#745715',msInk:'#fdfbf5'},
 dark:{bg:'#0a2231',surface:'#0f3047',sunken:'#0c2a3d',wash:'#113c51',ink:'#f7f3e8',muted:'#a9bfcb',brand:'#40b5ad',brandInk:'#123c55',brandText:'#5cd0c8',accent:'#40b5ad',accentInk:'#123c55',focus:'#5cd0c8',lineStrong:'#6a8ca0',ok:'#6fd6a3',danger:'#ff9c90',ms:'#c9a45c',msInk:'#123c55'}}
let fail=0
for(const [n,t] of Object.entries(themes)){
 const grounds=['bg','surface','sunken','wash']
 const chk=(fg,bg,min)=>{const r=cr(t[fg],t[bg]);const ok=r>=min;if(!ok)fail++;console.log(`${n.padEnd(5)} ${fg.padEnd(10)} on ${bg.padEnd(8)} ${r.toFixed(2)} ${ok?'ok':'FAIL <'+min}`)}
 for(const fg of ['ink','muted','brandText','brand','ok','danger','ms'])for(const g of grounds)chk(fg,g,4.5)
 chk('brandInk','brand',4.5);chk('accentInk','accent',4.5);chk('msInk','ms',4.5)
 for(const fg of ['focus','lineStrong'])for(const g of ['bg','surface','sunken'])chk(fg,g,3)
}
console.log(fail?`${fail} FAIL`:'all pass')
