# Onboarding — Cadastrar Empresa no Sistema

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte: [ONBOARDING.md](../../ONBOARDING.md)

---

## Após deploy (sistema no ar)

1. Acesse `https://frota-XXXX.vercel.app`
2. Faça login como admin
3. Vá em **/empresas/novo** e cadastre a empresa
4. Anote o `empresa_id` (UUID)
5. Em **/motoristas/novo**, cadastre cada motorista:
   - Nome completo
   - Celular com DDD + 9 dígito (formato: `5531987654321`)
   - `ativo = true`
6. Em **/veiculos/novo**, cadastre cada veículo:
   - Placa, modelo, ano
   - `ativo = true`

---

## Teste final

```
✅ Bot recebe "Oi"
✅ Bot identifica o motorista pelo número
✅ Bot responde com saudação
✅ Motorista testa "Informar KM" → manda foto → IA lê odômetro
```

---

## Veja também

- [implantacao-cliente.md](implantacao-cliente.md) — setup completo do zero
- [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md) — QR Code e webhook
