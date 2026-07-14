// Roda automaticamente todo dia (ver vercel.json) via Vercel Cron.
// Pra cada usuário com lembrete ativado que ainda não lançou nada hoje, manda uma notificação push.

const webpush = require('web-push');
const admin = require('firebase-admin');

function inicializar(){
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Variável FIREBASE_SERVICE_ACCOUNT_JSON não configurada no Vercel.');
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('Variáveis VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas no Vercel.');
  }
  let serviceAccount;
  try{
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }catch(e){
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não é um JSON válido — confira se colou o conteúdo inteiro do arquivo.');
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  webpush.setVapidDetails(
    'mailto:odometro-financeiro@example.com',
    process.env.VAPID_PUBLIC_KEY.trim(),
    process.env.VAPID_PRIVATE_KEY.trim()
  );
}

function dataDeHojeBrasilia() {
  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000); // Brasil não tem horário de verão desde 2019
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = async (req, res) => {
  try {
    inicializar();
    const db = admin.firestore();
    const hoje = dataDeHojeBrasilia();
    const usersRefs = await db.collection('users').listDocuments();
    let enviados = 0, verificados = 0;

    for (const userRef of usersRefs) {
      verificados++;
      const subDoc = await userRef.collection('meta').doc('pushSubscription').get();
      if (!subDoc.exists) continue;
      const subscription = subDoc.data();
      if (!subscription || !subscription.endpoint) continue;

      const entryDoc = await userRef.collection('entries').doc(hoje).get();
      if (entryDoc.exists) continue; // já lançou hoje, não precisa lembrar

      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          title: 'Odômetro Financeiro',
          body: 'Você ainda não lançou nada hoje. Não esquece de anotar antes de dormir!'
        }));
        enviados++;
      } catch (err) {
        // Inscrição expirada ou inválida — remove pra não tentar de novo
        if (err.statusCode === 410 || err.statusCode === 404) {
          await userRef.collection('meta').doc('pushSubscription').delete();
        }
      }
    }

    res.status(200).json({ ok: true, data: hoje, verificados, enviados });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
};
