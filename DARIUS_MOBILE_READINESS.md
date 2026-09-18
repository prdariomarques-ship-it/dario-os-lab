# DARIUS MOBILE READINESS — RC FREEZE 2026-09-13

## VEREDITO
**APK = NOT BUILT.** Mobile NÃO está pronto. Nada nesta rodada altera isso — o estado
real é registrado abaixo para que nenhuma afirmação futura seja ambígua.

## ESTADO ATUAL (inventário físico)
- `mobile/App.js` — scaffold placeholder Expo (sem navegação, sem telas do DARIUS)
- `mobile/package.json` — Expo SDK 51; `axios` declarado e NÃO usado
- Nenhum `app.json`, nenhum `eas.json`, nenhuma config Android/iOS
- Nenhum API client, nenhuma tela, nenhuma integração de auth
- Nenhum binário, nenhum APK/AAB gerado em qualquer ponto da história do branch

## GAPS PARA UM APK REAL
1. **`app.json` ausente** — nome, ícone, splash, package id, versão
2. **Config Android ausente** — permissões de rede, `usesCleartextTraffic` (se HTTP
   local em dev), target SDK
3. **API client ausente** — cliente tipado sobre `http://<host>:<porta>/api` com
   timeout e tratamento de erro (equivalente ao `web/src/api.ts`)
4. **Integração de auth pendente** — `DARIUS_API_TOKEN` via header é suportado pelo
   servidor (`Authorization: Bearer` ou `x-darius-token`), mas o mecanismo de
   provisionamento do token no app (input do usuário? build config?) é decisão de
   produto ainda não tomada
5. **Telas por fazer** — Dashboard/Tasks/Agents/Finance no mínimo; estados
   RUNNING/PAUSED/WAITING_APPROVAL/FAILED/COMPLETED/CANCELLED e ações approve/reject
6. **Termux requirements** (alternativa sem APK): Node.js no Termux, `BIND_HOST=0.0.0.0`,
   `DARIUS_API_TOKEN` definido, acesso por IP local — o servidor já suporta esse modo
   (documentado em DARIUS_HARDENING.md); o que falta é o app, não o backend
7. **LAN requirements** — CORS hoje é allowlist de localhost; clientes nativos não
   enviam `Origin` e passam sem alteração (verificado no smoke); nenhum cambio
   necessário para app nativo
8. **Emulador/device test** — impossível neste ambiente (sem Android SDK/emulador);
   exigiria máquina com Android Studio ou device físico
9. **APK build steps** (quando chegar a hora):
   - Rota A (recomendada): `eas build -p android --profile preview` (requer conta Expo)
   - Rota B (local): `npx expo prebuild` + `cd android && ./gradlew assembleRelease`
     (requer JDK 17 + Android SDK)
   - Em ambos os casos: assinatura com keystore própria, nunca a debug padrão

## ORDEM SUGERIDA (pós-freeze, operação separada)
1. Definir app.json + config Android mínima
2. API client + 1 tela (Finance) consumindo o servidor real
3. Validação em device físico do usuário (Termux na mesma LAN)
4. Só então: build de APK
