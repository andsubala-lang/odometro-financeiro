// Roda automaticamente todo dia (ver vercel.json) via Vercel Cron.
// Pra cada usuário com lembrete ativado que ainda não lançou nada hoje, manda uma notificação push.

const webpush = require('web-push');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

webpush.setVapidDetails(
  'mailto:odometro-financeiro@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
