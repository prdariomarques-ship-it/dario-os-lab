# DARIUS REMOTE MIGRATION PLAN — preservação do RC1 e publicação da evolução

## PRINCÍPIOS INEGOCIÁVEIS
1. **RC1 histórico (`3b791ac`) nunca é apagado, renomeado ou reescrito** — em nenhum
   cenário, em nenhuma ordem.
2. **Force-push NUNCA é a primeira opção** — só seria aceitável em branches de trabalho
   pessoais do usuário, com backup prévio e nunca contra `main` ou contra o RC1.
3. **Nada é executado por agentes autônomos** — cada passo abaixo exige revisão humana
   antes do seguinte.
4. **O remote é dinâmico**: durante a operação de freeze (2026-09-13) o branch remoto
   `feature/darius-oss-phase-0-...` avançou EXTERNAMENTE de `469e8b1` para `ec49c2be`
   (terceiros/Jules continuam empurrando nele). **Nunca rebasear nosso trabalho sobre
   esse branch** — ele já deletou `src/` uma vez (`6fcb884`, -6711 linhas) e continua
   sendo movido por outros.

## ESTADO DOCUMENTADO (2026-09-13)
- Local: `feature/darius-finance` @ `19dc432` (RC2 candidate), fsck limpo, 0 tags
- `main` remoto = `c7c2e55` (ancestral do RC1, gateway Telegram apenas)
- `feature/darius-oss-phase-0-...` remoto = `ec49c2be` (externo, não buscado, DESTRUTIVO)
- Nosso HEAD não existe em nenhum remote — todo o trabalho está apenas local

## ESTRATÉGIA RECOMENDADA — branch de integração NOVO (nunca sobrescrever)

### Fase 0 — Backup local (antes de tocar em qualquer remote)
```
git bundle create darius-feature-finance-19dc432.bundle feature/darius-finance
git bundle create darius-rc1-3b791ac.bundle 3b791ac
```
Guardar os bundles fora da máquina. Isso torna o force-push desnecessário PARA SEMPRE:
o RC1 e a evolução ficam recuperáveis mesmo se tudo der errado no remote.

### Fase 1 — Novo branch de integração (local)
```
git branch integration/darius-rc2 19dc432        # aponta para o candidato, sem checkout
git fsck --full --no-reflogs                      # sanidade final antes de publicar
```
Nunca criar esse branch sobre `469e8b1`/`ec49c2be` e nunca rebasear sobre eles.

### Fase 2 — Transferência para o remote (primeiro push, sem força)
```
git push origin integration/darius-rc2            # cria ref NOVA no remote
```
- É um push normal de branch novo: não sobrescreve nada que já exista.
- Se alguém reclamar de "non-fast-forward", NÃO usar `--force`: significa que o nome
  do branch colidiu com algo existente — escolher outro nome.

### Fase 3 — Validação no remoto (revisão humana + CI)
```
# no GitHub: abrir Pull Request integration/darius-rc2 -> main
# conferir no diff que:
#   - nenhum commit de 469e8b1/ec49c2be entra (git log --oneline main..integration/darius-rc2)
#   - RC1 3b791ac continua alcançável: git merge-base --is-ancestor 3b791ac <head>
#   - os 22+1 commits da evolução estão presentes e íntegros
```
Rodar a suíte completa na CI (ou localmente após `git clone` fresco): 157/157,
typecheck 0, smokes.

### Fase 4 — Merge (só depois da revisão humana aprovada)
```
# PR merge por merge-commit (NÃO squash: preserva os hashes auditados no manifesto;
# NÃO rebase-merge: reescreveria os hashes que DARIUS_RELEASE_MANIFEST.md registra)
```

### Fase 5 — Tag (última operação, só com o merge concluído)
```
git tag -a v0.1.0-rc.2 -m "DARIUS OSS RC2 candidate (post-RC1 evolution)" <merge-commit>
git push origin v0.1.0-rc.2                       # tag nova, nunca re-tag
```
- RC1 permanece SEM tag própria a menos que o usuário decida explicitamente marcar
  `3b791ac` também (ex.: `v0.1.0-rc.1` retroativa — operação separada e opcional).

### Fase 6 — Preservação permanente do RC1
- Opção A (mínima): não fazer nada — `3b791ac` já é ancestral do merge e fica
  permanentemente alcançável.
- Opção B (auditável): criar branch dedicado `git branch rc1/historical 3b791ac` +
  push — dá um endereço permanente e legível no GitHub para o RC1 original.

## CENÁRIOS PROIBIDOS
- `git push --force` contra `main` ou contra qualquer branch que contenha o RC1
- Rebase/merge que incorpore `469e8b1`/`ec49c2be` (destrutivos, movidos por terceiros)
- Apagar `feature/darius-oss-phase-0-...` no remote (não é nosso; contém trabalho de
  terceiros mesmo que destrutivo)
- Criar tag apontando para commit diferente do validado no manifesto
- Squash do PR (destruiria a cadeia de commits que o manifesto audita)
