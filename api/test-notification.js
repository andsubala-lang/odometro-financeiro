// Dispara uma notificação de teste pra conta autenticada que chamar esse endpoint.
// Usado pelo botão "Enviar notificação de teste" dentro do app.

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido' });
    return;
  }
  try {
    inicializar();
    const db = admin.firestore();

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ ok: false, error: 'Faça login novamente.' });
      return;
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const subDoc = await db.collection('users').doc(uid).collection('meta').doc('pushSubscription').get();
    if (!subDoc.exists) {
      res.status(404).json({ ok: false, error: 'Ative o lembrete primeiro (não encontrei nenhuma inscrição salva).' });
      return;
    }

    const subscription = subDoc.data();
    await webpush.sendNotification(subscription, JSON.stringify({
      title: 'Odômetro Financeiro 🔔',
      body: 'Essa é uma notificação de teste — se você está vendo isso, o lembrete está funcionando!'
    }));

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    if (e.statusCode === 410 || e.statusCode === 404) {
      res.status(410).json({ ok: false, error: 'Sua inscrição expirou. Desative e ative o lembrete de novo.' });
      return;
    }
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
