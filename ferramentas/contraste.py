def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[(v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4) for v in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def raz(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)
T = {
 'serra':'#304890','serra-noite':'#16234A','carmim':'#6E5220','carmim-brilho':'#D9AB4A',
 'neblina':'#E9EBEE','tinta':'#14171F','musgo':'#545B66','papel':'#FFFFFF','preto':'#05070D',
 'turquesa':'#086055','turquesa-brilho':'#22D3C5','turquesa-noite':'#04211D',
}
pares = [
 ('tinta','neblina','texto corrido'), ('tinta','papel','texto em superfície'),
 ('musgo','neblina','texto secundário'), ('musgo','papel','texto secundário'),
 ('serra','neblina','títulos e links'), ('serra','papel','títulos e links'),
 ('carmim','neblina','ação/destaque'), ('carmim','papel','ação/destaque'),
 ('papel','serra','texto sobre azul'), ('papel','serra-noite','texto sobre azul escuro'),
 ('papel','carmim','texto em botão'), ('neblina','serra','texto sobre azul'),
 ('preto','carmim-brilho','trigo sobre preto'), ('serra-noite','carmim-brilho','trigo sobre azul escuro'),
 ('carmim-brilho','preto','preto sobre trigo (texto de botão)'),
 ('turquesa','neblina','assistente/texto'), ('turquesa','papel','assistente/texto'),
 ('papel','turquesa-noite','texto sobre botão'), ('turquesa-brilho','turquesa-noite','glow sobre botão'),
]
print(f"  {'par':38} {'razão':>7}  AA texto  AA grande/UI")
for a,b,uso in pares:
    r=raz(T[a],T[b])
    print(f"  {a+' sobre '+b:26} {uso[:10]:11}{r:6.2f}:1   {'OK ' if r>=4.5 else 'NÃO'}       {'OK' if r>=3 else 'NÃO'}")
