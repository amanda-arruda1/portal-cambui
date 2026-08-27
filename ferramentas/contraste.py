def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[(v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4) for v in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def raz(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)
T = {
 'serra':'#0C5430','serra-noite':'#06301C','carmim':'#A8303C',
 'neblina':'#E9EDEA','tinta':'#141C18','musgo':'#4C5A51','papel':'#FFFFFF',
}
pares = [
 ('tinta','neblina','texto corrido'), ('tinta','papel','texto em superfície'),
 ('musgo','neblina','texto secundário'), ('musgo','papel','texto secundário'),
 ('serra','neblina','títulos e links'), ('serra','papel','títulos e links'),
 ('carmim','neblina','ação/destaque'), ('carmim','papel','ação/destaque'),
 ('papel','serra','texto sobre verde'), ('papel','serra-noite','texto sobre verde escuro'),
 ('papel','carmim','texto em botão'), ('neblina','serra','texto sobre verde'),
]
print(f"  {'par':38} {'razão':>7}  AA texto  AA grande/UI")
for a,b,uso in pares:
    r=raz(T[a],T[b])
    print(f"  {a+' sobre '+b:26} {uso[:10]:11}{r:6.2f}:1   {'OK ' if r>=4.5 else 'NÃO'}       {'OK' if r>=3 else 'NÃO'}")
