# Giraffe Doom — versão Android

O jogo roda fora do Claude. O multiplayer usa o Firebase do projeto `giraffe-doom`
(login anônimo + Realtime Database), com salas por código.

## Pastas
- `www/` — o jogo (HTML, JS, imagens, fontes e o Firebase embutidos)
- `www/net-firebase.js` — conexão com o Firebase (a configuração do projeto está aqui)
- `android/` — projeto Android (Capacitor)
- `database.rules.json` — regras de segurança do Realtime Database
- `.github/workflows/apk.yml` — o GitHub compila o APK sozinho

## Como gerar o APK pelo GitHub
1. Crie um repositório no GitHub e envie esta pasta inteira para ele.
2. A cada envio, a aba **Actions** compila o jogo (uns 5 minutos).
3. O APK aparece em **Releases → GiraffeDoom.apk**. Abra esse link no celular para baixar e instalar.

## Como gerar o APK no computador (opcional)
Precisa de Node 22 e do Android Studio.
```
npm install
npx cap sync android
npx cap open android      (no Android Studio: Build > Build APK)
```

## Mudou algo no jogo?
Edite os arquivos em `www/` e envie de novo para o GitHub. Um novo APK sai sozinho e
instala por cima do antigo.
