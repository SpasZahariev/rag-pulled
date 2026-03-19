FROM node:20-slim

RUN npm install -g firebase-tools

WORKDIR /app

COPY docker/firebase-emulator/firebase.json firebase.json

RUN mkdir -p data/firebase-emulator

EXPOSE 5503 5504

CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-project", "--export-on-exit=./data/firebase-emulator", "--import=./data/firebase-emulator"]
