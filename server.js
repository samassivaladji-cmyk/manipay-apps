// ManiPay API v4.50 — Fix recalcul: initiateur_id pour identifier agent vs client
// Fuseau horaire fixé explicitement (Abidjan = UTC+0, pas de changement d'heure) pour que
// le cron de minuit et les calculs CURRENT_DATE restent corrects même si l'hébergeur change
// son fuseau par défaut.
process.env.TZ = 'Africa/Abidjan'
const express = require('express')
// ══ Firebase Admin SDK pour Push Notifications ══
let fcmAdmin = null
try {
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: 'afrim-pay',
        clientEmail: 'firebase-adminsdk-fbsvc@afrim-pay.iam.gserviceaccount.com',
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCsPZGGkcXWdmD5
4IJALNZl8Cg4+Ap04ZIUxRCB7lg9rDRq1SoNAkbnCaeFZ2cgg8D7zYpVC93M5rBR
nzV1T0llpKCDhhUJF1RQbak1mEnD6MQi1o9PXotY8Eufl1c2QcQefL9Wl+oTsuQr
b9sRO14BBdUejL3W9+0VDniDArMVW0t9MqV7glz9cVGBrafQ13A1OuxYHVs8IsLO
OgjDekQsbSJ6iwu6GrsyNThjN5V7dGfM8m3lXxPWiQOdIN7Y5Sf2W9cpNxQpLmX2
hh/lFgN+D9JURuQGz0710cHQ6tsYMVMPk4HIdBzgstxDq9w6jt9J834+V6CE6PcL
iPOJvtDBAgMBAAECggEARjVKjon5FLRoTzK+pR4hvqeoHaCt0nroKuMxGWVoPqtl
Km79lxPohuCeknhVxyEtlvZvfr85h/44vOyiw9Cv4Gi8rSAIjw4dZjNtF9Wdq+fD
m1fOTtIBBx3cFY+BEzK3mJ3M+KUv2xu+eh48M8f5R31zI+LGt0uULlMZuH1vNjK2
2fwv0GKi9D7Zjj5XM6voXO8XLxi+uiETq1CAAow/TScSsA/fVYIik3oR71t/fANP
SDcIW5lrFKYefh1H0wX7+32xL1XTQj2WYlyAdyyVunYLAQp9FxpsLilIQvrJs7Kx
IboSg+0aJTGX6efgm6Ah3NYmVnUnlM8VIV/sco5oaQKBgQDjE34wE0fU3cjUMqhm
g052QEd9F7y1ahUeQ0ThZC6SAl1slmB0KnEt94P0qwPCYoLXsjCrbxkO6LpAiyNo
EVXfg6zGwKesse7HREV/NUwdswTAfuqg6BPUisLVljWP3Wznyiy0x2uHpwJPg1AS
Bp/nVejfEJoPtMI6EY/Fwi2tPwKBgQDCLf4xK7eiaTMtKkysP7mUu7UWJaREWmbm
kNvwFmeuAtM0falN2tE0jU+P3xh8YEWS++WJebm8p0Pujj7NKF5wPdiqvgL4Ji/+
X5TCJ1Ea33ULIlX5eBa7+rtMK/Wgpc40c89eOYTzRR11n3Pbfs7QHfn+XsqFgWk+
pitqIO4B/wKBgQCt0yYttxStpnkttvmiP7G4Y8xVve3/EY3I9MWto/riWl0Z2qNL
SZIKFgc1LBRcoPx4ETeghBMyjoTFE72u1FZgG3QPUTsJv8uBTonErw/tTDS/Bmil
dAJ6GR68UZf+4QmVBfbjDCUMWpQyOdr5cYjGlcUFvLeyfjSQLxFX2SUOEQKBgB+H
OjufnoxnSmDt+k8Jdcd5htiWugpDJ2wOXzenW6Q8XzCpqqCyg79lpmJ01dP0Cbfo
4Icm1YqVGgmU3QuQn2zYDeMDQRYrlSVXPZ8cpSWY3Lc3FwCPiBlzh4/Bn3s7ELUh
jKz+5+Bb+4GKp1QfTdMq2tl7aKSus3jxoCD2Qc7fAoGALSZZajqkYJOLAluF7GSu
WsuZrtL3KTDAw1H5eELP6cVZUe4ILVHkrHGfWGW+CB5gRqWWKDcmhJP6XLZULTPy
jiV4OsTIc/AGPqyXKXPJF6p7faVFMs3heaqlNV3uA0IEaBLanmGNl1FKiMG2HUMB
NVvSi12PISUaJe3cnUpUl5U=
-----END PRIVATE KEY-----
`
      })
    })
  }
  fcmAdmin = admin
  console.log('[FCM] Firebase Admin SDK initialisé')
} catch(e) {
  console.warn('[FCM] firebase-admin non disponible:', e.message)
}

// Envoyer une push notification FCM
async function sendPush(fcmToken, title, body, data={}) {
  if (!fcmAdmin || !fcmToken) return
  try {
    await fcmAdmin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])),
      android: { priority: 'high', notification: { sound: 'default', channelId: 'mani_pay' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { icon: 'https://samassivaladji-cmyk.github.io/manipay-apps/logo.png', badge: 'https://samassivaladji-cmyk.github.io/manipay-apps/logo.png', sound: 'default' }
      }
    })
  } catch(e) { console.warn('[FCM] Push error:', e.message) }
}
// Notifie TOUS les appareils déjà connus d'un compte (optionnellement en excluant un deviceId précis
// — utile pour prévenir "les autres appareils" quand un nouveau tente de se connecter).
async function pushTousAppareils(userId, titre, message, data={}, excludeDeviceId=null) {
  try {
    const rows = await sql(
      excludeDeviceId
        ? `SELECT fcm_token FROM fcm_tokens WHERE utilisateur_id=$1 AND device_id != $2`
        : `SELECT fcm_token FROM fcm_tokens WHERE utilisateur_id=$1`,
      excludeDeviceId ? [userId, excludeDeviceId] : userId
    )
    for (const r of rows) { if (r.fcm_token) await sendPush(r.fcm_token, titre, message, data) }
  } catch(e) { console.warn('[FCM] pushTousAppareils:', e.message) }
}
const cors = require('cors')
const helmet = require('helmet')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')
// Enregistrer le type UUID pour que pg accepte les strings UUID sans cast
require('pg').types.setTypeParser(2950, v => v)
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false })
const sql = (query, ...args) => {
  // Accepte sql(q, [p1,p2]) ou sql(q, p1, p2)
  const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args.length > 0 ? args : undefined
  return pgPool.query(query, params).then(r => r.rows)
}
// Normalise un code de parrainage/marchand saisi manuellement : insensible à la casse,
// aux espaces et aux tirets éventuels (anciens codes générés avec tiret, saisie manuelle
// avec espace...). Les nouveaux codes générés n'ont plus jamais de tiret, mais cette
// normalisation reste nécessaire pour les codes déjà existants et pour tolérer la saisie.
function normCode(s) { return String(s || '').toUpperCase().replace(/[\s-]/g, '') }

// Détecte les PIN à 4 chiffres évidents — uniquement sur des critères qu'on peut vérifier sans
// donnée supplémentaire (on ne connaît pas la date de naissance des clients) : chiffres tous
// identiques (0000, 1111...) ou séquences consécutives croissantes/décroissantes (1234, 4321...).
// Code de récupération : 8 caractères — 4 chiffres + 4 lettres (majuscules, sans O/I pour
// éviter la confusion), affiché UNE SEULE FOIS à la génération, jamais stocké en clair —
// seul son hash (bcrypt, comme le PIN) est conservé.
function genererCodeRecuperation() {
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sans O, I pour éviter la confusion
  let chiffres = ''
  for (let i = 0; i < 4; i++) chiffres += Math.floor(Math.random() * 10)
  let lettresPart = ''
  for (let i = 0; i < 4; i++) lettresPart += lettres[Math.floor(Math.random() * lettres.length)]
  return chiffres + '-' + lettresPart // ex: 4821-KXTM
}

function estPinFaible(pin) {
  if (/^(\d)\1{3}$/.test(pin)) return true
  const ascendant = '0123456789', descendant = '9876543210'
  if (ascendant.includes(pin) || descendant.includes(pin)) return true
  // Refuse les PIN qui ressemblent à une année de naissance plausible (1940-2025) — on ne
  // demande pas la date de naissance à l'inscription, mais un PIN à 4 chiffres dans cette
  // tranche est trop souvent une année de naissance, facile à deviner pour un proche.
  const n = parseInt(pin, 10)
  if (n >= 1940 && n <= 2025) return true
  return false
}

// Génère un PIN temporaire à 4 chiffres ALÉATOIRE pour toute réinitialisation (jamais "1234" —
// un code prévisible que quelqu'un de malveillant à l'affût pourrait anticiper). Ce PIN doit
// être communiqué au titulaire (par le support, ou affiché directement en libre-service) et
// changé dès la prochaine connexion (pin_a_changer=TRUE dans tous les appels).
function genererPinTemporaire() {
  let pin
  do { pin = String(Math.floor(1000 + Math.random() * 9000)) } while (estPinFaible(pin))
  return pin
}

// Vérifie si une clé (téléphone_utilisateur) est actuellement bloquée après trop de mauvaises
// tentatives OTP. Retourne le nombre de minutes restantes si bloqué, sinon null.
async function verifierBlocageOTP(cle) {
  const rows = await sql(`SELECT blocked_until FROM otp_lockouts WHERE cle=$1`, cle)
  if (!rows.length) return null
  const restant = new Date(rows[0].blocked_until) - new Date()
  if (restant <= 0) return null // expiré : on garde la ligne (compteur de récidive), juste plus bloquant
  const heures = Math.ceil(restant / 3600000)
  return heures
}
// Pose un blocage de 24h pour cette paire (agent/business + client). Si c'est la 2e fois que
// cette MÊME paire est bloquée, escalade : suspension complète du compte fautif + alerte au
// Back-office pour vérification manuelle avant réactivation (l'agent devra appeler).
async function poserBlocageOTP(cle, userId, clientNom, typeOp) {
  const existing = await sql(`SELECT offenses FROM otp_lockouts WHERE cle=$1`, cle)
  const offenses = existing.length ? Number(existing[0].offenses) + 1 : 1
  await pgPool.query(
    `INSERT INTO otp_lockouts (cle, blocked_until, offenses) VALUES ($1, NOW()+INTERVAL '24 hours', $2)
     ON CONFLICT (cle) DO UPDATE SET blocked_until=EXCLUDED.blocked_until, offenses=EXCLUDED.offenses`,
    [cle, offenses]
  )
  if (offenses >= 2) {
    await pgPool.query(`UPDATE utilisateurs SET statut='bloque' WHERE id=$1`, [userId])
    await pgPool.query(
      `INSERT INTO alertes (id, titre, description, gravite, service, statut, auteur, auteur_role, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'haute', 'admin', 'ouverte', 'systeme', 'systeme', NOW(), NOW())`,
      [
        'Compte bloqué automatiquement — tentatives OTP répétées',
        `Le compte ${userId} a été bloqué après une 2e série de codes OTP incorrects avec le client ${clientNom||''} (${typeOp}). Vérification manuelle nécessaire avant toute réactivation.`
      ]
    ).catch(()=>{})
  }
  return offenses
}

// Nouveau format de code de parrainage : 4 chiffres + 2 lettres (initiale du nom + initiale du
// prénom), ex. "4821DJ" pour Jean Dupont. Si un seul nom existe (cas Business : le nom de
// l'entreprise, sans prénom distinct), on prend les 2 premières lettres de ce nom à la place.
// Avec seulement 10 000 combinaisons possibles par paire d'initiales, une vérification d'unicité
// est indispensable (contrairement à l'ancien format, quasi jamais en collision).
async function genererCodeParrainageUnique(prenom, nom) {
  const p = String(prenom || '').trim()
  const n = String(nom || '').trim()
  let suffixe
  if (!p || p.toUpperCase() === n.toUpperCase()) {
    // Nom seul (ex: Business) -> 2 premières lettres du nom
    const base = (n.replace(/[^a-zA-Z]/g, '') || 'XX').toUpperCase()
    suffixe = (base.slice(0, 2) + 'XX').slice(0, 2)
  } else {
    const initialeNom = (n.replace(/[^a-zA-Z]/g, '')[0] || 'X').toUpperCase()
    const initialePrenom = (p.replace(/[^a-zA-Z]/g, '')[0] || 'X').toUpperCase()
    suffixe = initialeNom + initialePrenom
  }
  for (let essai = 0; essai < 30; essai++) {
    const chiffres = String(Math.floor(1000 + Math.random() * 9000))
    const code = chiffres + suffixe
    const existe = await sql(`SELECT 1 FROM utilisateurs WHERE UPPER(REPLACE(REPLACE(code_parrainage,'-',''),' ','')) = $1 LIMIT 1`, code)
    if (!existe.length) return code
  }
  // Filet de sécurité si les 10 000 combinaisons de cette paire d'initiales sont épuisées
  return String(Math.floor(1000 + Math.random() * 9000)) + suffixe + Math.random().toString(36).slice(2, 3).toUpperCase()
}

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'mani_jwt_secret_2024'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mani_refresh_secret_2024'

// ── Helper notifications ──────────────────────────────────────────────
// Récupère l'ID fiable depuis la base (format UUID avec tirets = même format que notifications)
async function getUidSql(userId) {
  if (!userId) return null
  // Si c'est déjà une string UUID avec tirets, l'utiliser directement
  const s = String(userId)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s
  // Sinon, Buffer ou autre format — chercher via Prisma
  try {
    const row = await sql(
      'SELECT id::text as id FROM utilisateurs WHERE id = $1', userId
    )
    if (row && row[0]) return row[0].id
  } catch(e) {}
  // Dernier recours : convertir Buffer en hex
  if (Buffer.isBuffer(userId)) return userId.toString('hex')
  return s
}

async function notifier(userId, type, titre, message, data = {}) {
  if (!userId) { console.error('notifier: userId manquant!'); return }
  const uidStr = await getUidSql(userId)
  if (!uidStr) { console.error('notifier: uid introuvable pour', userId); return }
  try {
    await pgPool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [uidStr, type, titre, message, JSON.stringify(data||{})]
    )
    console.log('✉ Notif OK:', type, '->', uidStr.substring(0,8)+'...')
    // ══ Envoyer push FCM si token enregistré ══
    const tokenRows = await sql(
      `SELECT fcm_token FROM utilisateurs WHERE id=$1 AND fcm_token IS NOT NULL LIMIT 1`, uidStr
    ).catch(()=>[])
    if (tokenRows.length && tokenRows[0].fcm_token) {
      await sendPush(tokenRows[0].fcm_token, titre, message, { type, ...data })
    }
  } catch(e) { 
    console.error('notif ERREUR:', e.message, '| uid:', uidStr.substring(0,8), '| type:', type)
  }
}

// Types de notifications :
// 'transaction' — dépôt, retrait, transfert, paiement
// 'kyc'         — validation, refus, upgrade
// 'securite'    — connexion, verrouillage, reset PIN
// 'systeme'     — message admin, alerte
// 'parrainage'  — nouveau filleul, récompense


app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '15mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

const signAccess = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '2h' })
const signRefresh = (p) => jwt.sign(p, JWT_REFRESH_SECRET, { expiresIn: '7d' })
const ok = (res, data, s = 200) => res.status(s).json({ success: true, data })
const err = (res, msg, s = 400) => res.status(s).json({ success: false, message: msg })

// ═══ LOG ACTIONS SENSIBLES ═══
async function logAction(acteur, action, cible, detail=''){
  try {
    // Convertir UUID Buffer → string (Prisma retourne les UUID comme Buffer)
    const toStr = (v) => {
      if (!v) return ''
      if (Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
      return String(v)
    }
    await pgPool.query(
      `INSERT INTO actions_log (acteur_id, acteur_nom, acteur_role, acteur_tel, action, cible_id, cible_nom, cible_role, cible_tel, detail, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [toStr(acteur.id), ((acteur.prenom||'')+' '+(acteur.nom||'')).trim(), acteur.role||'?', acteur.telephone||'?', action, toStr(cible.id), ((cible.prenom||'')+' '+(cible.nom||'')).trim(), cible.role||'?', cible.telephone||'?', detail||'']
    )
  } catch(e){ console.error('logAction error:', e.message) }
}

// ── PLAFOND EFFECTIF (client et business uniquement) ──
async function calculerPlafondEffectif(utilisateur) {
  if (!['client','business'].includes(utilisateur.role)) return 999999999
  const kyc = utilisateur.kycNiveau || 'KYC1'
  // Compter les filleuls RATTACHÉS (conditions entrée+sortie remplies)
  const nbRattaches = await sql(
    `SELECT COUNT(*) as n FROM rattachements WHERE parrain_id = $1 AND statut = 'valide'`,
    utilisateur.id
  ).then(r => Number(r[0]?.n || 0)).catch(() => 0)

  if (kyc === 'KYC3') {
    if (nbRattaches >= 500) return 100000
    if (nbRattaches >= 200) return 50000
    return 20000
  }
  if (kyc === 'KYC2') {
    if (nbRattaches >= 200) return 50000
    return 20000
  }
  return 20000 // KYC1 toujours 20000
}

// ── VÉRIFIER ET VALIDER UN RATTACHEMENT ──
// UNE SEULE CONDITION : dépôt OU transfert reçu >= 500 FCFA → rattaché à vie
// Le parrain reçoit 10% des frais générés par son filleul rattaché (retraits/paiements)
async function verifierRattachement(filleulId, typeOp, montant) {
  if (montant < 500) return
  // Seules les entrées d'argent comptent
  if (!['depot', 'transfert_recu', 'paiement_marchand_recu'].includes(typeOp)) return
  try {
    const filleulRows = await sql(`SELECT id::text as id, parrain_id::text as "parrainId" FROM utilisateurs WHERE id = $1 LIMIT 1`, filleulId)
    const filleul = filleulRows[0] || null
    if (!filleul || !filleul.parrainId) return
    // Vérifier s'il est déjà rattaché
    const existing = await sql(
      `SELECT statut FROM rattachements WHERE filleul_id = $1`, filleulId
    ).then(r => r[0] || null).catch(() => null)
    if (existing && existing.statut === 'valide') return // Déjà rattaché à vie
    if (existing) {
      // Mettre à jour en valide
      await pgPool.query(
        `UPDATE rattachements SET statut='valide', date_entree=NOW() WHERE filleul_id = $1`,
        [filleulId]
      )
    } else {
      // Créer et valider directement
      await pgPool.query(
        `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at)
         VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
        [require('crypto').randomUUID(), filleul.parrainId, filleulId]
      )
    }
    console.log('[RATTACHEMENT] Validé:', filleulId, '→ parrain:', filleul.parrainId)
    // Le suivi anti-triche (remboursement filleul → parrain dans les 7 jours) est fait
    // par le job périodique horaire qui scanne tous les rattachements valides récents.
  } catch(e) {
    console.warn('[RATTACHEMENT] Erreur:', e.message)
  }
}

async function creerAlerteRattachementSuspect(parrainId, filleulId, montant, dateCreation, motif) {
  const [parrainInfo, filleulInfo] = await Promise.all([
    sql(`SELECT prenom, nom, telephone, role FROM utilisateurs WHERE id = $1`, parrainId).then(r => r[0]),
    sql(`SELECT prenom, nom, telephone FROM utilisateurs WHERE id = $1`, filleulId).then(r => r[0])
  ])
  const nomParrain = parrainInfo ? `${parrainInfo.prenom||''} ${parrainInfo.nom||''} (${parrainInfo.telephone||'?'})` : parrainId
  const nomFilleul = filleulInfo ? `${filleulInfo.prenom||''} ${filleulInfo.nom||''} (${filleulInfo.telephone||'?'})` : filleulId
  await pgPool.query(
    `INSERT INTO alertes (titre, description, gravite, service, auteur, auteur_role) VALUES ($1,$2,$3,$4,$5,$6)`,
    '🚨 Triche rattachement détectée — détachement automatique',
    `${motif}. Parrain: ${nomParrain}. Filleul: ${nomFilleul}. Montant: ${montant} le ${dateCreation}. Le filleul a été détaché automatiquement du parrain. Vérifier l'historique complet et sanctionner si confirmé.`,
    'critique', 'backoffice', 'systeme', 'systeme'
  )
  console.log('[ANTI-TRICHE] Alerte créée + détachement: parrain', parrainId, '↔ filleul', filleulId)
}

async function verifierPlafondParrainage(clientId, montantAjouter) {
  // Les plafonds KYC concernent uniquement les GAINS DE PARRAINAGE
  // (10% des frais des filleuls rattachés), pas les dépôts/retraits
  const toUUID0 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
  const clientIdStr = toUUID0(clientId)
  const debut = new Date(); debut.setDate(1); debut.setHours(0,0,0,0)
  // Compter les gains de parrainage ce mois (type commission dans commissions)
  const result = await sql(
    `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
     WHERE beneficiaire_id = $1 AND type_commission = 'parrainage'
     AND date_calcul >= $2`,
    clientIdStr, debut
  )
  const totalMois = Number(result[0]?.total || 0)
  const clientRows = await sql(`SELECT kyc_niveau FROM utilisateurs WHERE id = $1`, clientIdStr)
  if (!clientRows.length) return { plafond: 999999999, totalMois: 0, reste: 999999999 }
  const kyc = clientRows[0].kyc_niveau || 'KYC1'
  const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
  const plafond = plafonds[kyc] || 20000
  if (totalMois + montantAjouter > plafond) {
    throw new Error('Plafond de parrainage atteint. Plafond ' + kyc + ' : ' + plafond.toLocaleString('fr-FR') + '/mois de gains parrainage')
  }
  return { plafond, totalMois, reste: plafond - totalMois }
}
// Alias pour compatibilité
async function verifierPlafondMensuel(clientId, montantAjouter) {
  return verifierPlafondParrainage(clientId, montantAjouter)
}

// ═══ ROLES BACK-OFFICE ═══
// admin         → accès total
// superviseur   → sa zone : users, tickets, alertes, kyc validate
// support_client→ recherche client (lecture), tickets, remboursement
// support_tech  → transactions, alertes système, tickets escaladés

const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return err(res, 'Token manquant', 401)
  // 1. Vérifier JWT (expiration/signature)
  let p
  try { p = jwt.verify(h.slice(7), JWT_SECRET) }
  catch (e) { return err(res, 'Token expiré', 401) }
  // 2. Charger utilisateur en base
  try {
    const authRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone, u.position_confirmee as "positionConfirmee", u.pin_hash as "pinHash",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.id = $1 GROUP BY u.id`, p.userId
    )
    const user = authRows[0] || null
    if (!user) return err(res, 'Compte introuvable', 401)
    if (!user.comptes) user.comptes = []
    if (user.statut === 'bloque') return err(res, 'Compte bloqué. Contactez le support.', 401)
    req.user = user
    next()
  } catch (e) { return err(res, e.message || 'Erreur serveur auth', 500) }
}

const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : err(res, 'Permission refusée', 403)

// Téléphone du Super Back-office — peut avoir role='admin' OU role='backoffice' en base,
// donc toujours vérifier via le téléphone, pas seulement via le rôle.
const SUPER_ADMIN_TEL = '0505414751'
const isSuperAdminUser = (u) => !!u && (u.role === 'admin' || u.role === 'backoffice') && u.telephone === SUPER_ADMIN_TEL

// Récupère l'ID du super admin en DB (mis en cache au premier appel)
let _superAdminId = null
async function getSuperAdminId() {
  if (_superAdminId) return _superAdminId
  try {
    const rows = await pgPool.query(`SELECT id::text FROM utilisateurs WHERE telephone=$1 LIMIT 1`, [SUPER_ADMIN_TEL])
    _superAdminId = rows.rows[0]?.id || null
  } catch(e) { _superAdminId = null }
  return _superAdminId
}

// Vérifie si un userId est le super admin — exclure de TOUS les calculs de commission
async function isSuperAdminId(userId) {
  if (!userId) return false
  const sid = await getSuperAdminId()
  return sid && String(userId) === String(sid)
}

// ── TARIFICATION ManiPay v6.0 ──────────────────────────────────────────────
const TAUX_RETRAIT           = 0.01    // 1% frais de retrait (inchangé)
const TAUX_PAIEMENT          = 0.01    // 1% frais paiement marchand — TOTAL, désormais partagé
// Partage des frais de paiement marchand : 0.5% côté client (payeur) + 0.5% côté business (bénéficiaire)
const TAUX_PAIEMENT_CLIENT   = 0.005
const TAUX_PAIEMENT_BUSINESS = 0.005
function splitFraisPaiement(montant) {
  const fraisTotal = Math.round(montant * TAUX_PAIEMENT)
  const fraisClient = Math.round(fraisTotal / 2)
  const fraisBusiness = fraisTotal - fraisClient
  return { fraisTotal, fraisClient, fraisBusiness }
}
// Parrainage (gain sur un filleul rattaché) : le taux dépend du RÔLE du parrain
const TAUX_PARRAINAGE_STANDARD = 0.05  // client, business : 5%
const TAUX_PARRAINAGE_PRO      = 0.10  // agent, mini_master, master (parrain direct) : 10%
function tauxParrainagePourRole(role) {
  return ['agent','mini_master','master'].includes(role) ? TAUX_PARRAINAGE_PRO : TAUX_PARRAINAGE_STANDARD
}
// Plafonds mensuels de gains de parrainage (par rôle du parrain)
const PLAFONDS_PARRAINAGE_CLIENT = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
const PLAFOND_PARRAINAGE_BUSINESS = 200000
// Réseau agents (retrait) : Mini-Master toujours 5% (ce sont toujours SES agents directs).
// Master : 7% si l'agent lui est directement rattaché, 5% si l'agent est rattaché via un Mini-Master.
const TAUX_RESEAU_MINIMASTER      = 0.05
const TAUX_RESEAU_MASTER_DIRECT   = 0.07
const TAUX_RESEAU_MASTER_VIA_MM   = 0.05
// Réseau business (paiement marchand) : Mini-Master 10%, Master 20%
const TAUX_PAY_MINIMASTER    = 0.10
const TAUX_PAY_MASTER        = 0.20
// Plus de TAUX_DEPOT_COMM (0.3% supprimé) ni PART_OPERATEUR (35% supprimé)

// Calcule le gain de parrainage effectif pour un parrain donné, en appliquant
// le taux selon son rôle ET le plafond mensuel (client : 20k/50k/100k selon KYC ;
// business : 200k flat ; agent/mini_master/master : aucun plafond).
// Ne bloque JAMAIS la transaction du filleul — plafonne simplement le montant crédité.
async function calculerGainParrainPlafonne(parrainId, parrainRole, fraisMontant) {
  const taux = tauxParrainagePourRole(parrainRole)
  let gain = Math.round(fraisMontant * taux)
  if (gain <= 0) return { gain: 0, taux }
  if (parrainRole === 'client' || !parrainRole) {
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0,0,0,0)
    const totalRows = await pgPool.query(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
       WHERE beneficiaire_id::text = $1 AND type_commission = 'parrainage' AND date_calcul >= $2`,
      [String(parrainId), debutMois]
    )
    const totalMois = Number(totalRows.rows[0]?.total || 0)
    const kycRows = await pgPool.query(`SELECT kyc_niveau FROM utilisateurs WHERE id::text = $1 LIMIT 1`, [String(parrainId)])
    const kyc = kycRows.rows[0]?.kyc_niveau || 'KYC1'
    const plafond = PLAFONDS_PARRAINAGE_CLIENT[kyc] || 20000
    gain = Math.max(0, Math.min(gain, plafond - totalMois))
  } else if (parrainRole === 'business') {
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0,0,0,0)
    const totalRows = await pgPool.query(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
       WHERE beneficiaire_id::text = $1 AND type_commission = 'parrainage' AND date_calcul >= $2`,
      [String(parrainId), debutMois]
    )
    const totalMois = Number(totalRows.rows[0]?.total || 0)
    gain = Math.max(0, Math.min(gain, PLAFOND_PARRAINAGE_BUSINESS - totalMois))
  }
  // agent / mini_master / master : pas de plafond
  return { gain, taux }
}

// ── COMMISSION AGENT HYBRIDE (adoptée pour remplacer la grille à 27 paliers) ─
// Principe : calculée séparément sur le dépôt et le retrait, jamais mélangés.
//   • Dépôt  : 0,2 % du montant déposé (l'agent est payé sur ce qu'il traite réellement,
//              même si le dépôt reste gratuit pour le client — pas de trou de marge).
//   • Retrait : un pourcentage DÉGRESSIF du frais de retrait (1 %) réellement collecté,
//              le taux diminuant par palier de volume total (dépôt+retrait) du jour —
//              pour retrouver l'effet dégressif de l'ancienne grille sur les gros agents,
//              tout en restant toujours proportionnel à un frais réel, jamais à du volume gratuit.
const TAUX_DEPOT_AGENT = 0.002 // 0,2% du montant déposé
const PALIERS_TAUX_RETRAIT_AGENT = [
  { min: 0,        max: 999999,     taux: 0.35 },
  { min: 1000000,  max: 2499999,    taux: 0.28 },
  { min: 2500000,  max: 4999999,    taux: 0.22 },
  { min: 5000000,  max: 9999999,    taux: 0.17 },
  { min: 10000000, max: Infinity,   taux: 0.12 },
]
function tauxRetraitAgent(volumeTotalJour) {
  const p = PALIERS_TAUX_RETRAIT_AGENT.find(p => volumeTotalJour >= p.min && volumeTotalJour <= p.max)
  return p ? p.taux : 0.12
}
// Retourne la commission journalière hybride, à partir des volumes dépôt et retrait du jour (séparés)
function getCommJournaliere(volumeDepot, volumeRetrait) {
  volumeDepot = volumeDepot || 0
  volumeRetrait = volumeRetrait || 0
  const volumeTotal = volumeDepot + volumeRetrait
  if (volumeTotal <= 0) return 0
  const commDepot = Math.round(volumeDepot * TAUX_DEPOT_AGENT)
  const fraisRetrait = volumeRetrait * TAUX_RETRAIT
  const commRetrait = Math.round(fraisRetrait * tauxRetraitAgent(volumeTotal))
  return commDepot + commRetrait
}


// ── Mise à jour commission temps réel (J = en_attente, retirable J+1 minuit) ──
async function majCommissionJourAgent(agentId) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const debut = today + ' 00:00:00'
    const fin   = today + ' 23:59:59'
    // Calcul volume du jour — dépôt et retrait SÉPARÉS (nécessaire pour la commission hybride)
    // On exclut les doublons via DISTINCT ON reference pour éviter double comptage
    const volRows = await pgPool.query(`
      SELECT
        COALESCE(SUM(montant) FILTER (WHERE type='depot'), 0)::float as volume_depot,
        COALESCE(SUM(montant) FILTER (WHERE type='retrait'), 0)::float as volume_retrait
      FROM (
        SELECT DISTINCT ON (reference) montant, type FROM transactions
        WHERE initiateur_id::text=$1 AND type IN ('depot','retrait')
          AND statut='complete' AND date_creation BETWEEN $2 AND $3
        ORDER BY reference, date_creation ASC
      ) t
    `, [agentId, debut, fin])
    const volumeDepot = volRows.rows[0]?.volume_depot || 0
    const volumeRetrait = volRows.rows[0]?.volume_retrait || 0
    const comm = getCommJournaliere(volumeDepot, volumeRetrait)
    // Upsert commission en_attente du jour
    await pgPool.query(`
      UPDATE commissions SET montant=$2, montant_original=$2, statut='en_attente'
      WHERE beneficiaire_id::text=$1 AND type_commission='commission_journaliere'
        AND date_calcul::date=CURRENT_DATE AND statut='en_attente'
    `, [agentId, comm])
    // Si UPDATE n'a rien modifié → INSERT
    if (comm > 0) {
      await pgPool.query(`
        INSERT INTO commissions (id, beneficiaire_id, type_commission, montant, montant_original, taux, statut, date_calcul)
        SELECT gen_random_uuid()::text, $1, 'commission_journaliere', $2, $2, 0, 'en_attente', (CURRENT_DATE::text || ' 23:59:00')::timestamp
        WHERE NOT EXISTS (
          SELECT 1 FROM commissions WHERE beneficiaire_id::text=$1
            AND type_commission='commission_journaliere' AND date_calcul::date=CURRENT_DATE
        )
      `, [agentId, comm]).catch(()=>{})
    }
  } catch(e) { console.warn('[COMM JOUR]', e.message) }
}

// ── COMPTE SYSTÈME ManiPay ──────────────────────────────────────────────
// Identifiants fixes (stables entre redémarrages)
const MANI_PAY_USER_ID   = '7dfd4580-d3c1-46df-9415-4a591729e423'
const MANI_PAY_COMPTE_ID = '00000000-0000-0000-0000-000000000002'

// Initialisation au démarrage : créer l'utilisateur et le compte système s'ils n'existent pas
async function initManiPaySystem() {
  try {
    // Compte système ManiPay lié au super admin (7dfd4580...)
    // Le compte a été créé manuellement en base — on vérifie juste qu'il existe
    await pgPool.query(`
      INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at)
      VALUES ($1, $2, 0, 999999999999, 'systeme', NOW())
      ON CONFLICT DO NOTHING
    `, [MANI_PAY_COMPTE_ID, MANI_PAY_USER_ID]).catch(()=>{})
    console.log('[ManiPay SYSTEM] Compte système vérifié')
  } catch(e) { console.warn('[ManiPay SYSTEM] Init warning:', e.message) }
}

// ── COMMISSIONS JOURNALIÈRES AGENTS ──────────────────────────────────────────
// ═══ COMMISSIONS JOURNALIÈRES — logique commune HTTP + scheduler interne ═══
// Surveillance de volume anormal : compare le volume du jour de chaque compte pro (agent,
// mini-master, master, business) à sa moyenne journalière historique (30 derniers jours,
// hors aujourd'hui, en ne comptant que les jours où le compte a été actif). Si le volume du
// jour dépasse ce seuil d'un facteur important, une alerte est créée automatiquement pour
// que le Back-office vérifie avant que les dégâts ne s'accumulent, plutôt qu'après coup.
const SEUIL_VOLUME_ANORMAL = 5 // volume du jour > 5x la moyenne historique
const MIN_JOURS_HISTORIQUE = 5 // au moins 5 jours d'activité passée pour avoir une moyenne fiable

async function detecterVolumesAnormaux() {
  const comptes = await sql(`SELECT id::text as id, prenom, nom, role, telephone FROM utilisateurs WHERE role IN ('agent','mini_master','master','business') AND statut='actif'`)
  let alertesCreees = 0
  for (const c of comptes) {
    try {
      // Volume du jour (dépôt/retrait en tant qu'initiateur, transfert/paiement en tant que source ou destination)
      const volJourRows = await pgPool.query(`
        SELECT COALESCE(SUM(t.montant),0)::float as vol FROM transactions t
        LEFT JOIN comptes cs ON cs.id = t.compte_source_id
        LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
        WHERE t.statut='complete' AND t.date_creation >= CURRENT_DATE
          AND (t.initiateur_id::text = $1 OR cs.utilisateur_id::text = $1 OR cd.utilisateur_id::text = $1)
      `, [c.id])
      const volJour = volJourRows.rows[0]?.vol || 0
      if (volJour <= 0) continue

      // Moyenne journalière historique (30 jours précédents, jours actifs uniquement)
      const histRows = await pgPool.query(`
        SELECT DATE(t.date_creation) as jour, SUM(t.montant)::float as vol FROM transactions t
        LEFT JOIN comptes cs ON cs.id = t.compte_source_id
        LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
        WHERE t.statut='complete' AND t.date_creation >= CURRENT_DATE - INTERVAL '30 days' AND t.date_creation < CURRENT_DATE
          AND (t.initiateur_id::text = $1 OR cs.utilisateur_id::text = $1 OR cd.utilisateur_id::text = $1)
        GROUP BY DATE(t.date_creation)
      `, [c.id])
      const joursActifs = histRows.rows
      if (joursActifs.length < MIN_JOURS_HISTORIQUE) continue
      const moyenneHisto = joursActifs.reduce((s,r) => s + Number(r.vol), 0) / joursActifs.length
      if (moyenneHisto <= 0) continue

      if (volJour > moyenneHisto * SEUIL_VOLUME_ANORMAL) {
        // Éviter les doublons : une seule alerte de ce type par compte et par jour
        const dejaAlerte = await sql(
          `SELECT 1 FROM alertes WHERE description LIKE $1 AND created_at::date = CURRENT_DATE LIMIT 1`,
          [`%volume-anormal:${c.id}%`]
        )
        if (dejaAlerte.length) continue
        await pgPool.query(
          `INSERT INTO alertes (id, titre, description, gravite, service, statut, auteur, auteur_role, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, 'moyenne', 'admin', 'ouverte', 'systeme', 'systeme', NOW(), NOW())`,
          [
            `Volume anormal — ${c.prenom||''} ${c.nom||''}`,
            `[volume-anormal:${c.id}] Le compte ${c.prenom||''} ${c.nom||''} (${c.role}, ${c.telephone}) a traité ${Math.round(volJour).toLocaleString('fr-FR')} aujourd'hui, contre une moyenne habituelle de ${Math.round(moyenneHisto).toLocaleString('fr-FR')}/jour (×${(volJour/moyenneHisto).toFixed(1)}). Vérification recommandée.`
          ]
        )
        alertesCreees++
      }
    } catch (e) { console.warn('[VOLUME ANORMAL]', c.id, e.message) }
  }
  return { comptesAnalyses: comptes.length, alertesCreees }
}

async function crediterCommissionsJourna(dateStrOpt) {
  let dateStr = dateStrOpt
  // À minuit pile : la journée qui vient de se terminer = AUJOURD'HUI (date courante)
  // (hier = le jour d'avant, mais à 00h00:01 la "journée terminée" c'est la date courante)
  if (!dateStrOpt) {
    // À 00h00:00, on est sur le nouveau jour — la journée complète terminée = le jour précédent
    const hier = new Date()
    hier.setDate(hier.getDate() - 1)
    dateStr = hier.toISOString().slice(0, 10)
  }
  const debut = dateStr + ' 00:00:00'
  const fin   = dateStr + ' 23:59:59'
  // ── 1. Passer les GAINS d'hier (parrainage + réseau) en_attente → verse ──
  // Gains générés AVANT aujourd'hui = virables dès maintenant
  await pgPool.query(`
    UPDATE commissions SET statut='verse'
    WHERE statut='en_attente'
      AND type_commission IN (
        'parrainage','commission_parrain',
        'reseau_mini_master_retrait','reseau_mini_master_paiement',
        'reseau_master_retrait','reseau_master_paiement',
        'reseau_master_retrait_mm','reseau_master_paiement_mm'
      )
      AND date_calcul::date < CURRENT_DATE
  `).catch(e => console.error('[CRON] Erreur passage gains verse:', e.message))
  console.log('[CRON] Gains hier → verse OK')

  // ── 2. Commissions journalières agents/mini-masters/masters ──
  const agents = await pgPool.query(`
    SELECT id::text as id, telephone, prenom, nom, role
    FROM utilisateurs WHERE role IN ('agent','mini_master','master') AND statut = 'actif'
  `)
  let credited = 0, skipped = 0, results = []
  for (const agent of agents.rows) {
    const volRows = await pgPool.query(`
      SELECT
        COALESCE(SUM(t.montant) FILTER (WHERE t.type='depot'), 0)::float as volume_depot,
        COALESCE(SUM(t.montant) FILTER (WHERE t.type='retrait'), 0)::float as volume_retrait
      FROM transactions t
      WHERE t.initiateur_id::text = $1 AND t.type IN ('depot','retrait')
        AND t.statut = 'complete' AND t.date_creation BETWEEN $2 AND $3
    `, [agent.id, debut, fin])
    const volumeDepot = volRows.rows[0]?.volume_depot || 0
    const volumeRetrait = volRows.rows[0]?.volume_retrait || 0
    const volume = volumeDepot + volumeRetrait
    const comm = getCommJournaliere(volumeDepot, volumeRetrait)
    if (comm <= 0) { skipped++; continue }
    const deja = await pgPool.query(`
      SELECT id FROM commissions WHERE beneficiaire_id::text = $1
        AND type_commission = 'commission_journaliere' AND date_calcul::date = $2
    `, [agent.id, dateStr])
    if (deja.rows.length > 0) { skipped++; continue }
    await pgPool.query(`
      UPDATE commissions SET statut='verse'
      WHERE beneficiaire_id::text=$1 AND type_commission='commission_journaliere'
        AND statut='en_attente' AND date_calcul::date < CURRENT_DATE
    `, [agent.id])
    const dejaV = await pgPool.query(`
      SELECT id FROM commissions WHERE beneficiaire_id::text=$1
        AND type_commission='commission_journaliere' AND date_calcul::date=$2 AND statut='verse'
    `, [agent.id, dateStr])
    if (dejaV.rows.length === 0 && comm > 0) {
      await pgPool.query(`
        INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
        VALUES ($1,$2,'commission_journaliere',$3,0,'verse',$4)
        ON CONFLICT (beneficiaire_id,type_commission,date_calcul::date) DO UPDATE SET montant=$3,statut='verse'
      `, [require('crypto').randomUUID(), agent.id, comm, dateStr + ' 23:59:00'])
      credited++
    }
    await notifier(agent.id, 'gains', '📊 Commission journalière',
      `+${comm.toLocaleString('fr-FR')} pour un volume de ${volume.toLocaleString('fr-FR')}.`,
      { montant: comm, volume, type: 'commission_journaliere' }
    ).catch(()=>{})
    results.push({ agent: agent.telephone, volume, comm })
  }
  console.log(`[CRON] ${dateStr} → ${credited} crédités, ${skipped} ignorés`)
  return { date: dateStr, credited, skipped, details: results }
}

// ═══ SCHEDULER INTERNE — 00h00 chaque nuit, heure d'Abidjan (remplace cron-job.org) ═══
function planifierProchainCron() {
  const now = new Date()
  const demain = new Date(now)
  // Si on est avant minuit aujourd'hui, on programme pour aujourd'hui à 00h00
  // sinon pour demain à 00h00
  const cible = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  if (cible <= now) cible.setDate(cible.getDate() + 1)
  const delaiMs = cible.getTime() - now.getTime()
  const h = Math.floor(delaiMs / 3600000)
  const m = Math.floor((delaiMs % 3600000) / 60000)
  console.log(`[CRON] Prochain lancement dans ${h}h${m}m (${cible.toISOString()})`)
  setTimeout(async () => {
    console.log('[CRON] Lancement commissions journalières...')
    try {
      const result = await crediterCommissionsJourna()
      console.log('[CRON] Terminé :', result.credited, 'crédités')
    } catch(e) {
      console.error('[CRON] Erreur :', e.message)
    }
    try {
      const resultVol = await detecterVolumesAnormaux()
      console.log('[CRON] Volumes anormaux :', resultVol.alertesCreees, 'alerte(s) sur', resultVol.comptesAnalyses, 'comptes')
    } catch(e) {
      console.error('[CRON] Erreur détection volume :', e.message)
    }
    // Reprogrammer pour la nuit suivante
    planifierProchainCron()
  }, delaiMs)
}
// Démarrer le scheduler au lancement du serveur
planifierProchainCron()

// Route HTTP manuelle pour tester/rattraper la détection de volume anormal (admin seulement)
// Diagnostic : voir les tokens FCM enregistrés pour un compte (pour déboguer les notifications
// qui n'arrivent pas — permet de savoir si le problème vient de l'enregistrement du token ou
// de l'envoi de la notification elle-même).
app.get('/setup/verifier-tokens-fcm', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const { telephone } = req.query
    if (!telephone) return res.status(400).json({error:'Paramètre telephone requis'})
    const userRows = await sql(`SELECT id::text as id, prenom, nom, telephone, fcm_token FROM utilisateurs WHERE telephone=$1 LIMIT 1`, telephone)
    if (!userRows.length) return res.json({ error: 'Compte introuvable' })
    const user = userRows[0]
    const tokens = await sql(`SELECT device_id, fcm_token, updated_at FROM fcm_tokens WHERE utilisateur_id=$1 ORDER BY updated_at DESC`, user.id)
    const appareils = await sql(`SELECT device_id, user_agent, first_seen, last_seen FROM appareils_connus WHERE utilisateur_id=$1 ORDER BY last_seen DESC`, user.id)
    return res.json({
      compte: { id: user.id, nom: `${user.prenom||''} ${user.nom||''}`, telephone: user.telephone, ancienTokenColonne: user.fcm_token ? 'présent' : 'absent' },
      tokensFcmParAppareil: tokens.map(t => ({ deviceId: t.device_id, tokenPresent: !!t.fcm_token, tokenApercu: t.fcm_token ? t.fcm_token.slice(0,20)+'...' : null, dernièreMaj: t.updated_at })),
      appareilsConnus: appareils
    })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})

// Route ponctuelle : initialise/confirme le code de récupération fixe (2008) du super admin
app.get('/setup/fixer-code-super-admin', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const SUPER_ADMIN_TEL = '0505414751'
    const hash = await bcrypt.hash('2008', 10)
    const r = await pgPool.query(`UPDATE utilisateurs SET code_recuperation_hash=$1 WHERE telephone=$2`, [hash, SUPER_ADMIN_TEL])
    return res.json({ success: true, comptesMisAJour: r.rowCount })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})

app.get('/setup/detecter-volumes-anormaux', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const result = await detecterVolumesAnormaux()
    return res.json({ success: true, ...result })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})

// Route HTTP maintenue pour rattrapage manuel (admin seulement)
app.get('/setup/crediter-commissions-journalieres', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const result = await crediterCommissionsJourna(req.query.date || null)
    return res.json({ success: true, ...result })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})


// ── Volume journalier de l'agent (pour affichage temps réel côté front) ──
app.get('/api/v1/commissions/volume-jour', authMiddleware, async (req, res) => {
  try {
    const agentId = toUUID(req.user.id)
    const today = new Date().toISOString().slice(0, 10)
    const rows = await pgPool.query(`
      SELECT COALESCE(SUM(montant),0)::float as volume FROM (
        SELECT DISTINCT ON (reference) montant FROM transactions
        WHERE initiateur_id::text=$1 AND type IN ('depot','retrait')
          AND statut='complete' AND date_creation::date=CURRENT_DATE
        ORDER BY reference, date_creation ASC
      ) t
    `, [agentId])
    const volume = rows.rows[0]?.volume || 0
    return ok(res, volume)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ COMMISSION RÉSEAU — Mini-Master et Master ═══════════════════════════════
// Remonte la chaîne depuis L'OPÉRATEUR uniquement
// Règle : le mini-master gagne 1% seulement quand son AGENT traite le retrait
// Si le mini-master fait lui-même le retrait, il ne gagne rien (la chaîne remonte vers le Master au-dessus)
// typeBase : 'retrait' | 'depot' | 'paiement_marchand'
// baseAmount : frais sur lesquels s'applique le %
// Retourne la liste des IDs (Masters + Mini-Masters + Agents + Business) visibles par un
// superviseur donné. Si le superviseur n'a aucun Master assigné (table superviseur_masters),
// retourne null → superviseur GÉNÉRAL, aucune restriction. Sinon, descend la hiérarchie de
// rattachement (parrain_id -> filleul_id) à partir des Masters assignés, jusqu'aux agents et
// comptes Business rattachés, à n'importe quel niveau de la chaîne.
// Version générique : descend la hiérarchie de rattachement à partir d'UN SEUL Master donné,
// sans dépendre d'une affectation de superviseur. Utilisée pour le filtre "par Master" du
// comparateur (utile notamment à un superviseur général pour distinguer plusieurs réseaux).
async function getReseauSousMaster(masterId) {
  const rows = await pgPool.query(`
    WITH RECURSIVE reseau AS (
      SELECT id::text FROM utilisateurs WHERE id::text = $1
      UNION
      SELECT r.filleul_id::text FROM rattachements r
      JOIN reseau ON reseau.id = r.parrain_id::text
      WHERE r.statut = 'valide'
    )
    SELECT id FROM reseau
  `, [masterId])
  return rows.rows.map(r => r.id)
}

async function getReseauVisibleSuperviseur(superviseurId) {
  const sup = await sql(`SELECT superviseur_type FROM utilisateurs WHERE id=$1 LIMIT 1`, superviseurId)
  if (!sup[0] || sup[0].superviseur_type !== 'regional') return null // général : pas de restriction
  const masters = await sql(`SELECT master_id FROM superviseur_masters WHERE superviseur_id=$1`, superviseurId)
  if (!masters.length) return [] // régional sans aucun Master assigné : ne voit encore rien (pas d'accès par défaut)
  const masterIds = masters.map(m => m.master_id)
  // Descente récursive de la hiérarchie de rattachement à partir des Masters assignés
  const rows = await pgPool.query(`
    WITH RECURSIVE reseau AS (
      SELECT id::text FROM utilisateurs WHERE id::text = ANY($1::text[])
      UNION
      SELECT r.filleul_id::text FROM rattachements r
      JOIN reseau ON reseau.id = r.parrain_id::text
      WHERE r.statut = 'valide'
    )
    SELECT id FROM reseau
  `, [masterIds])
  return rows.rows.map(r => r.id)
}

async function crediterReseauHierarchie(operateurId, sourceId, baseAmount, typeBase) {
  if (!baseAmount || baseAmount <= 0) return 0
  let totalDistribue = 0
  try {
    // Un seul point de départ : l'opérateur (agent ou mini-master qui traite l'opération)
    // Pour paiement_marchand sans opérateur, on part du sourceId (le payeur/business)
    const startIds = new Set()
    if (operateurId) {
      startIds.add(String(operateurId))
    } else if (sourceId) {
      startIds.add(String(sourceId))
    }
    // Cas spécial paiement_marchand : pas d'opérateur, partir du payeur
    if (!operateurId && sourceId) startIds.add(String(sourceId))

    // Pour chaque point de départ, remonter toute la hiérarchie
    const dejaCredites = new Set() // éviter double crédit, partagé entre TOUS les points de départ
    for (const startId of startIds) {
      let currentId = startId
      const MAX_NIVEAUX = 6 // sécurité anti-boucle infinie
      let viaMiniMaster = false // devient true dès qu'un Mini-Master a été crédité sur CE chemin

      // Rôle de L'OPÉRATEUR d'origine (celui qui a réellement traité l'opération).
      // Le taux Master "direct" (7%) est réservé au cas où c'est un AGENT qui est
      // directement rattaché au Master. Si c'est le Mini-Master lui-même qui traite
      // sa propre opération (ou tout autre rôle non-agent), le Master doit recevoir
      // le taux "via Mini-Master" (5%), même si aucun Mini-Master n'apparaît dans la
      // remontée — car il ne s'agit pas d'un agent direct.
      let operateurEstAgent = false
      try {
        const opRow = await pgPool.query(`SELECT role FROM utilisateurs WHERE id::text = $1 LIMIT 1`, [startId])
        operateurEstAgent = opRow.rows[0]?.role === 'agent'
      } catch (eOp) {}

      for (let niveau = 0; niveau < MAX_NIVEAUX; niveau++) {
        // Récupérer le parrain du noeud courant
        const row = await pgPool.query(
          `SELECT parrain_id::text as parrain_id FROM utilisateurs WHERE id::text = $1 LIMIT 1`,
          [currentId]
        )
        const parrainId = row.rows[0]?.parrain_id
        if (!parrainId || dejaCredites.has(parrainId)) break

        // Récupérer le rôle du parrain
        const parrainRow = await pgPool.query(
          `SELECT id::text, role FROM utilisateurs WHERE id::text = $1 LIMIT 1`,
          [parrainId]
        )
        const parrain = parrainRow.rows[0]
        if (!parrain) break

        // Créditer si Mini-Master ou Master
        if (parrain.role === 'mini_master' || parrain.role === 'master') {
          // Taux selon le type d'activité (réseau agents/retrait vs réseau business/paiement)
          // et, pour le Master sur le réseau agents, selon que l'opérateur est un AGENT
          // directement rattaché (7%) ou non — via un Mini-Master, ou le Mini-Master
          // lui-même qui opère (5% dans les deux cas).
          let tauxReseau
          if (typeBase === 'paiement_marchand') {
            tauxReseau = parrain.role === 'master' ? TAUX_PAY_MASTER : TAUX_PAY_MINIMASTER
          } else {
            const estDirectAgent = operateurEstAgent && !viaMiniMaster
            tauxReseau = parrain.role === 'master'
              ? (estDirectAgent ? TAUX_RESEAU_MASTER_DIRECT : TAUX_RESEAU_MASTER_VIA_MM)
              : TAUX_RESEAU_MINIMASTER
          }
          // typeBase 'paiement_marchand' → suffixe 'paiement' (cohérent avec le reste de l'app)
          const suffixeType = typeBase === 'paiement_marchand' ? 'paiement' : typeBase
          // Si ce Master reçoit ce gain via un Mini-Master OU via un opérateur non-agent
          // (ex. Mini-Master traitant lui-même), on le distingue avec le suffixe _mm
          const origineMM = (parrain.role === 'master' && typeBase !== 'paiement_marchand' && !(operateurEstAgent && !viaMiniMaster)) ? '_mm' : ''
          const typeComm = 'reseau_' + parrain.role + '_' + suffixeType + origineMM
          const gainReseau = Math.round(baseAmount * tauxReseau)

          if (gainReseau > 0) {
            dejaCredites.add(parrain.id)
            totalDistribue += gainReseau
            // Ne pas créditer le super admin (il opère pour les tests, pas pour gagner)
            const _saIdReseau = await getSuperAdminId()
            if (String(parrain.id) === String(_saIdReseau)) { currentId = parrain.parrainId || null; continue }
            await pgPool.query(
              `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
               VALUES ($1,$2,$3,$4,$5,'en_attente',NOW())`,
              [require('crypto').randomUUID(), parrain.id, typeComm, gainReseau, tauxReseau]
            ).catch(()=>{})

            // Notification
            const label = parrain.role === 'master' ? 'Master' : 'Mini-Master'
            await notifier(parrain.id, 'gains', '🌐 Commission réseau',
              `+${gainReseau.toLocaleString('fr-FR')} (${Math.round(tauxReseau*100)}% réseau ${typeBase}).`,
              { montant: gainReseau, type: typeComm }
            ).catch(()=>{})

            console.log(`[RESEAU] ${label} ${parrain.id} +${gainReseau} FCFA (${typeComm})`)

            if (parrain.role === 'mini_master') viaMiniMaster = true

            // Réseau BUSINESS (paiement marchand) : Master et Mini-Master sont séparés,
            // jamais cumulés sur la même transaction. Dès qu'un des deux a été crédité,
            // on arrête la remontée pour ce point de départ — contrairement au réseau
            // agents/retrait, où le Master continue de toucher sa part "via Mini-Master"
            // même quand le Mini-Master a déjà été crédité.
            if (typeBase === 'paiement_marchand') break
          }
        }

        // Continuer à remonter (même si ce noeud n'est pas MM ou Master)
        currentId = parrainId
      }
    }
  } catch(e) { console.warn('[RESEAU]', e.message) }
  return totalDistribue
}

// Créditer le compte ManiPay d'un gain (appelé après chaque opération)
async function creditManiPay(montant, typeOp, reference) {
  if (!montant || montant <= 0) return
  try {
    await pgPool.query(`UPDATE comptes SET solde = solde + $1 WHERE id::text = $2`, [montant, MANI_PAY_COMPTE_ID])
    const id = require('crypto').randomUUID()
    await pgPool.query(`
      INSERT INTO commissions (id, beneficiaire_id, type_commission, montant, taux, statut, date_calcul)
      VALUES ($1, $2, $3, $4, 0, 'verse', NOW())
    `, [id, MANI_PAY_USER_ID, 'gain_plateforme_'+typeOp, montant])
  } catch(e) { console.warn('[ManiPay] creditManiPay error:', e.message) }
}


// Middleware : autorise le rôle backoffice, OU le Super Back-office quel que soit son rôle exact
const roleBackofficeOuSuperAdmin = (req, res, next) =>
  (req.user.role === 'backoffice' || isSuperAdminUser(req.user)) ? next() : err(res, 'Permission refusée', 403)

// Rôles back-office complets
const BACKOFFICE = ['admin', 'backoffice', 'superviseur', 'support_client', 'support_tech']
const ADMIN_SUP = ['admin', 'backoffice', 'superviseur']
const ADMIN_ONLY = ['admin', 'backoffice']  // backoffice = gestionnaire (tout sauf supprimer)
const SUPPORT_CLIENT = ['admin', 'backoffice', 'support_client', 'support_tech']
const ALL_STAFF = ['admin', 'backoffice', 'support_client', 'support_tech', 'superviseur', 'master', 'mini_master']
const ALL_ROLES_NOTIF = ['client', 'agent', 'business', 'mini_master', 'master', 'superviseur', 'support_client', 'support_tech', 'admin', 'backoffice']
const SUPPORT_TECH = ['admin', 'backoffice', 'support_tech']
// Note: Les suppressions restent admin uniquement (voir routes DELETE)
const OPERATIONS = ['agent', 'mini_master', 'master', 'superviseur', 'admin']

// ── Helper universel Buffer→UUID ──────────────────────────────────
const toUUID = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }

// ═══ SETUP (sans auth) ═══
// Route de setup : créer la table alertes manuellement si elle n'existe pas
// Migration : renommer l'ancienne table alertes et créer la nouvelle

// Recalcul rétroactif des gains ManiPay sur toutes les transactions existantes
app.get('/setup/recalcul-gains-mani', async (req, res) => {
  try {
    // ── Nouveau modèle unifié : 1% retrait, 0.3% dépôt, 1% paiement
    const TAUX_RET   = 0.01
    const TAUX_PAY   = 0.01
    // Réseau agents (retrait) : Mini-Master 5% (toujours direct) ; Master 7% direct / 5% via Mini-Master
    const TAUX_MM         = 0.05
    const TAUX_MA_DIRECT  = 0.07
    const TAUX_MA_VIA_MM  = 0.05
    // Réseau business (paiement marchand) : Mini-Master 10%, Master 20%
    const TAUX_PAY_MM = 0.10
    const TAUX_PAY_MA = 0.20
    // Plus de TAUX_DEP ni PART_OP (commission journalière remplace)
    // Suivi en mémoire des plafonds mensuels de parrainage (la table commissions est vidée plus bas)
    const parrainageMoisTotal = {}
    function gainParrainagePlafonne(parrainId, parrainRole, frais, date) {
      const taux = tauxParrainagePourRole(parrainRole)
      let gain = Math.round(frais * taux)
      if (gain <= 0) return { gain: 0, taux }
      if (parrainRole === 'client' || !parrainRole || parrainRole === 'business') {
        const ym = new Date(date).toISOString().slice(0, 7)
        const key = parrainId + '_' + ym
        const dejaCeMois = parrainageMoisTotal[key] || 0
        const plafond = parrainRole === 'business'
          ? PLAFOND_PARRAINAGE_BUSINESS
          : (PLAFONDS_PARRAINAGE_CLIENT[userMap[parrainId]?.kyc_niveau || 'KYC1'] || 20000)
        gain = Math.max(0, Math.min(gain, plafond - dejaCeMois))
        parrainageMoisTotal[key] = dejaCeMois + gain
      }
      return { gain, taux }
    }

    // 1. Vider toutes les commissions existantes (repart from scratch)
    await pgPool.query(`DELETE FROM commissions`)
    // Remettre solde ManiPay à 0
    await pgPool.query(`UPDATE comptes SET solde=0 WHERE id::text=$1`, [MANI_PAY_COMPTE_ID])

    // 2. Récupérer toutes les transactions complètes avec infos opérateur
    const txs = await pgPool.query(`
      SELECT t.id::text, t.type, t.montant::float, t.frais::float,
             t.date_creation, t.reference,
             t.initiateur_id::text as initiateur_id,
             cs.utilisateur_id::text as src_user,
             cd.utilisateur_id::text as dst_user
      FROM transactions t
      LEFT JOIN comptes cs ON cs.id = t.compte_source_id
      LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
      WHERE t.statut = 'complete'
        AND t.type IN ('retrait','depot','paiement_marchand')
      ORDER BY t.date_creation ASC
    `)

    // 3. Charger la hiérarchie complète (parrain_id) en mémoire
    const users = await pgPool.query(`
      SELECT id::text, role, parrain_id::text, kyc_niveau
      FROM utilisateurs
    `)
    const userMap = {}
    users.rows.forEach(u => { userMap[u.id] = u })

    // Fonction remontée hiérarchique
    function getHierarchie(userId) {
      const chain = []
      let current = userId
      const seen = new Set()
      for (let i=0; i<6; i++) {
        const u = userMap[current]
        if (!u || !u.parrain_id || seen.has(u.parrain_id)) break
        seen.add(u.parrain_id)
        const parrain = userMap[u.parrain_id]
        if (parrain && (parrain.role==='mini_master'||parrain.role==='master')) {
          chain.push(parrain)
        }
        current = u.parrain_id
      }
      return chain
    }

    // Résultats
    const stats = {
      nb_tx: txs.rows.length,
      // Gains bruts
      frais_retrait_total: 0,
      commissions_depot_total: 0,
      frais_paiement_total: 0,
      // Redistributions
      gains_agents: 0,
      gains_parrains: 0,
      gains_mini_master: 0,
      gains_master: 0,
      // ManiPay
      mani_brut: 0,          // total gains ManiPay (retrait + paiement)
      mani_brut_retrait: 0,  // gains ManiPay sur retraits uniquement
      mani_brut_paiement: 0, // gains ManiPay sur paiements marchands uniquement
      mani_charges_depot: 0, // bonus dépôt financé par ManiPay
      mani_net: 0
    }
    const commissions = []
    const soldeMouvements = {} // userId -> delta solde

    function addComm(benefId, type, montant, taux, date) {
      if (!montant || montant <= 0) return
      commissions.push({
        id: require('crypto').randomUUID(),
        beneficiaire_id: benefId,
        type_commission: type,
        montant: Math.round(montant),
        taux,
        date_calcul: date
      })
      soldeMouvements[benefId] = (soldeMouvements[benefId]||0) + Math.round(montant)
    }

    for (const tx of txs.rows) {
      const date = tx.date_creation

      if (tx.type === 'depot') {
        // Dépôt : gratuit pour le client, pas de commission agent sur chaque dépôt
        // La rémunération agent est via la commission journalière sur volume total
        // Pas de gain ni charge pour ManiPay sur les dépôts

      } else if (tx.type === 'retrait') {
        const montant = tx.montant
        const frais = Math.round(montant * TAUX_RET)
        // Plus de gainOp (35%) — remplacé par commission journalière
        const agentId = tx.initiateur_id || tx.dst_user
        const clientId = tx.src_user
        const agentUser = userMap[agentId]
        if (!agentId || !agentUser || ['client','backoffice','admin','superviseur','support_client','support_tech'].includes(agentUser.role)) {
          stats.frais_retrait_total += frais
          stats.mani_brut += frais
          continue
        }
        const clientUser = clientId ? userMap[clientId] : null
        const hasParrain = !!(clientUser?.parrain_id && clientUser.parrain_id !== agentId)
        const parrainRole = hasParrain ? (userMap[clientUser.parrain_id]?.role || 'client') : null
        const { gain: gainParrain, taux: tauxParrainUtilise } = hasParrain
          ? gainParrainagePlafonne(clientUser.parrain_id, parrainRole, frais, date)
          : { gain: 0, taux: 0 }

        // Réseau
        let reseauRetrait = 0
        const startIds = new Set()
        startIds.add(agentId)
        if (clientId && clientId !== agentId) startIds.add(clientId)
        startIds.forEach(sid => {
          let viaMM = false
          const operateurEstAgent = userMap[sid]?.role === 'agent'
          getHierarchie(sid).forEach(p => {
            const estDirectAgent = operateurEstAgent && !viaMM
            const t = p.role==='master' ? (estDirectAgent ? TAUX_MA_DIRECT : TAUX_MA_VIA_MM) : TAUX_MM
            const g = Math.round(frais * t)
            reseauRetrait += g
            const origineMM = (p.role==='master' && !estDirectAgent) ? '_mm' : ''
            addComm(p.id, 'reseau_'+p.role+'_retrait'+origineMM, g, t, date)
            if (p.role==='mini_master') { stats.gains_mini_master += g; viaMM = true }
            else stats.gains_master += g
          })
        })

        // ManiPay = frais - parrain - réseau (plus de part agent sur les frais)
        const gainMani = Math.max(0, frais - gainParrain - reseauRetrait)

        stats.frais_retrait_total += frais
        stats.mani_brut += gainMani
        stats.mani_brut_retrait += gainMani

        if (hasParrain && gainParrain > 0) {
          addComm(clientUser.parrain_id, 'parrainage', gainParrain, tauxParrainUtilise, date)
          stats.gains_parrains += gainParrain
        }
        addComm(MANI_PAY_USER_ID, 'gain_plateforme_retrait', gainMani, null, date)

      } else if (tx.type === 'paiement_marchand') {
        const montant = tx.montant
        const frais = Math.round(montant * TAUX_PAY)

        stats.frais_paiement_total += frais

        // Parrain du client payeur reçoit un gain de parrainage (taux selon son rôle, plafonné)
        const payeurId = tx.src_user
        const payeurUser = payeurId ? userMap[payeurId] : null
        const hasParrainPay = !!(payeurUser?.parrain_id)
        const parrainPayRole = hasParrainPay ? (userMap[payeurUser.parrain_id]?.role || 'client') : null
        const { gain: gainParrainPay, taux: tauxParrainPayUtilise } = hasParrainPay
          ? gainParrainagePlafonne(payeurUser.parrain_id, parrainPayRole, frais, date)
          : { gain: 0, taux: 0 }
        if (hasParrainPay && gainParrainPay > 0) {
          addComm(payeurUser.parrain_id, 'parrainage', gainParrainPay, tauxParrainPayUtilise, date)
          stats.gains_parrains += gainParrainPay
        }

        // Réseau business : calculer ce qui est distribué
        let reseauPay = 0
        const businessId = tx.src_user
        if (businessId) {
          let viaMM = false
          getHierarchie(businessId).forEach(p => {
            const t = p.role==='master' ? TAUX_PAY_MA : TAUX_PAY_MM
            const g = Math.round(frais * t)
            reseauPay += g
            const origineMM = (p.role==='master' && viaMM) ? '_mm' : ''
            addComm(p.id, 'reseau_'+p.role+'_paiement'+origineMM, g, t, date)
            if (p.role==='mini_master') { stats.gains_mini_master += g; viaMM = true }
            else stats.gains_master += g
          })
        }

        // ManiPay = frais - parrain - réseau
        const gainManiPay = Math.max(0, frais - gainParrainPay - reseauPay)
        stats.mani_brut += gainManiPay
        stats.mani_brut_paiement += gainManiPay
        addComm(MANI_PAY_USER_ID, 'gain_plateforme_paiement_marchand', gainManiPay, null, date)
      }
    }

    // 4. Gains retrait pour ManiPay (déjà accumulé dynamiquement dans mani_brut_retrait)
    addComm(MANI_PAY_USER_ID, 'gain_plateforme_retrait', stats.mani_brut_retrait, null, new Date())

    // 5. Insérer toutes les commissions
    for (const c of commissions) {
      await pgPool.query(
        `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
         VALUES ($1,$2,$3,$4,$5,'verse',$6) ON CONFLICT DO NOTHING`,
        [c.id, c.beneficiaire_id, c.type_commission, c.montant, c.taux, c.date_calcul]
      ).catch(()=>{})
    }

    // 6. Recalculer soldes
    for (const [uid, delta] of Object.entries(soldeMouvements)) {
      if (uid === MANI_PAY_USER_ID) continue
      await pgPool.query(
        `UPDATE comptes SET solde = $1 WHERE utilisateur_id::text = $2`,
        [Math.max(0, delta), uid]
      ).catch(()=>{})
    }

    // 7. Solde net ManiPay
    // Solde net ManiPay = gains bruts (déjà nets de parrainage) - bonus dépôts
    stats.mani_net = stats.mani_brut - stats.mani_charges_depot
    await pgPool.query(
      `UPDATE comptes SET solde=$1 WHERE id::text=$2`,
      [Math.max(0, stats.mani_net), MANI_PAY_COMPTE_ID]
    )

    // 8. Synthèse lisible
    const total_redistrib = stats.gains_agents + stats.gains_parrains + stats.gains_mini_master + stats.gains_master
    const total_genere = stats.frais_retrait_total + stats.frais_paiement_total + stats.commissions_depot_total

    return res.json({
      success: true,
      modele: '1% retrait | 0.3% depot | 1% paiement | 35% op | 10% parrain | 3%/5% reseau',
      nb_transactions: stats.nb_tx,
      nb_commissions_generees: commissions.length,
      '--- REVENUS BRUTS ---': '---',
      frais_retrait_total: stats.frais_retrait_total,
      commissions_depot_total: stats.commissions_depot_total,
      frais_paiement_total: stats.frais_paiement_total,
      total_genere_brut: total_genere,
      '--- REDISTRIBUTION ---': '---',
      gains_agents: stats.gains_agents,
      gains_parrains_parrainage: stats.gains_parrains,
      gains_mini_master_reseau: stats.gains_mini_master,
      gains_master_reseau: stats.gains_master,
      total_redistribue: total_redistrib,
      '--- ManiPay ---': '---',
      mani_gains_retrait: stats.mani_brut_retrait,
      mani_gains_paiement: stats.mani_brut_paiement,
      mani_gains_bruts: stats.mani_brut,
      mani_charges_bonus_depot: stats.mani_charges_depot,
      mani_net: stats.mani_net,
      '--- RENTABILITE ---': '---',
      taux_retention_mani: total_genere > 0 ? (stats.mani_net / total_genere * 100).toFixed(1) + '%' : 'N/A',
      taux_redistribution_utilisateurs: total_genere > 0 ? (total_redistrib / total_genere * 100).toFixed(1) + '%' : 'N/A'
    })
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message, stack: e.stack?.split('\n').slice(0,5) })
  }
})

app.get('/setup/migrate-alertes', async (req, res) => {
  try {
    // Renommer l'ancienne table
    await pgPool.query(
      "ALTER TABLE alertes RENAME TO alertes_fraude_old"
    ).catch(e => console.log('rename:', e.message))
    // Créer la nouvelle table alertes
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `)
    await pgPool.query(
      "CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)"
    ).catch(()=>{})
    res.json({ ok: true, message: 'Migration réussie — nouvelle table alertes créée' })
  } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/setup/check-alertes', async (req, res) => {
  try {
    const cols = await sql(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='alertes' ORDER BY ordinal_position"
    )
    const count = await sql("SELECT COUNT(*)::int as n FROM alertes")
    res.json({ columns: cols, count: count[0].n })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// Correctif ponctuel : rattache rétroactivement les comptes Business qui ont un parrain mais
// n'ont jamais été rattachés (bug corrigé : le paiement marchand ne déclenchait pas le rattachement).
app.get('/setup/rattacher-business-existants', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const businesses = await pgPool.query(`
      SELECT u.id::text as id, u.parrain_id::text as "parrainId" FROM utilisateurs u
      WHERE u.role='business' AND u.parrain_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rattachements r WHERE r.filleul_id::text = u.id::text AND r.statut='valide')
    `)
    let corriges = 0
    for (const b of businesses.rows) {
      const existing = await pgPool.query(`SELECT id FROM rattachements WHERE filleul_id::text=$1`, [b.id])
      if (existing.rows.length) {
        await pgPool.query(`UPDATE rattachements SET statut='valide', date_entree=NOW() WHERE filleul_id::text=$1`, [b.id])
      } else {
        await pgPool.query(
          `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at) VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
          [require('crypto').randomUUID(), b.parrainId, b.id]
        )
      }
      corriges++
    }
    return res.json({ success: true, corriges })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})


// Nettoyage ponctuel : retire les tirets/espaces des codes_parrainage déjà en base
// (les anciens comptes, ex. le compte de test Business "BUS-BAFH", ont pu être créés
// avant que la génération de code n'exclue le tiret). À appeler une seule fois.
app.get('/setup/nettoyer-codes-parrainage', async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET || 'manipay-cron-2026'
  if (req.query.secret !== CRON_SECRET) return res.status(403).json({error:'Forbidden'})
  try {
    const rows = await pgPool.query(
      `UPDATE utilisateurs SET code_parrainage = UPPER(REPLACE(REPLACE(code_parrainage,'-',''),' ',''))
       WHERE code_parrainage ~ '[- ]'
       RETURNING id::text, telephone, code_parrainage`
    )
    return res.json({ success: true, corrige: rows.rowCount, comptes: rows.rows })
  } catch(e) { return res.status(500).json({ success: false, error: e.message }) }
})

app.get('/setup/create-alertes', async (req, res) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `)
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)
    `).catch(()=>{})
    res.json({ ok: true, message: 'Table alertes créée avec succès' })
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Route pour créer un compte equipe interne — SQL pur, sans Prisma
app.get('/setup/create-internal/:role/:tel/:prenom/:nom', async (req, res) => {
  try {
    const { role, tel, prenom, nom } = req.params
    const allowedRoles = ['admin','backoffice','support_client','support_tech','superviseur']
    if (!allowedRoles.includes(role)) return res.status(400).json({error:'Role invalide'})
    const pinHash = await bcrypt.hash('1234', 10)
    const code = await genererCodeParrainageUnique(prenom, nom)
    const rows = await sql(
      `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'actif', $6, NOW(), NOW())
       RETURNING id::text, prenom, nom, telephone, role, statut`,
      prenom, nom, tel, pinHash, role, code
    )
    res.json({ ok: true, ...rows[0], message: 'Compte créé avec PIN 1234' })
  } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/setup/make-admin/:tel', async (req, res) => {
  try {
    const uRows = await sql(`UPDATE utilisateurs SET role='admin', statut='actif', updated_at=NOW() WHERE telephone=$1 RETURNING role, statut`, req.params.tel)
    if (!uRows[0]) return res.json({ error: 'Utilisateur introuvable' })
    return res.json({ success: true, role: uRows[0].role, statut: uRows[0].statut })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/setup/create-test-accounts', async (req, res) => {
  try {
    const pinHash = await bcrypt.hash('1234', 10)
    const comptes = [
      { prenom:'Agent', nom:'Test', telephone:'0101010101', role:'agent', zone:'Zone1' },
      { prenom:'Business', nom:'Test', telephone:'0202020202', role:'business', zone:null },
      { prenom:'Master', nom:'Test', telephone:'0303030303', role:'master', zone:'Zone1' },
      { prenom:'MiniMaster', nom:'Test', telephone:'0404040404', role:'mini_master', zone:'Zone1' },
      { prenom:'Superviseur', nom:'Test', telephone:'0505050505', role:'superviseur', zone:null },
    ]
    const results = []
    for (const c of comptes) {
      try {
        const code = await genererCodeParrainageUnique(c.prenom, c.nom)
        await sql(
          `INSERT INTO utilisateurs (id,prenom,nom,telephone,pin_hash,role,zone,kyc_niveau,statut,code_parrainage,created_at,updated_at)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'KYC1','actif',$7,NOW(),NOW())
           ON CONFLICT (telephone) DO UPDATE SET role=$5, statut='actif', pin_hash=$4, updated_at=NOW()`,
          c.prenom, c.nom, c.telephone, pinHash, c.role, c.zone||null, code
        )
        const tRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE telephone=$1`, c.telephone)
        if (tRows[0]) {
          const cid_t = require('crypto').randomUUID()
          const cExist = await sql(`SELECT id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, tRows[0].id)
          if (!cExist.length) await pgPool.query(
            `INSERT INTO comptes (id,utilisateur_id,solde,plafond_mensuel,type_compte,created_at,updated_at) VALUES ($1,$2,100000,500000,$3,NOW(),NOW())`,
            [cid_t, tRows[0].id, c.role]
          )
        }
        results.push({ telephone: c.telephone, role: c.role, statut: 'ok' })
      } catch(e) { results.push({ telephone: c.telephone, error: e.message }) }
    }
    return res.json({ success: true, comptes: results })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ManiPay API v4.51' }))

// Test colonnes table commissions
app.get('/test/comm-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'commissions' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test colonnes table transactions
app.get('/test/columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})

// Test colonnes table comptes
app.get('/test/comptes-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'comptes' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test KYC table existence
app.get('/test/kyc', async (req, res) => {
  try {
    const result = await sql(`SELECT COUNT(*) as count FROM kyc_documents`)
    return res.json({ ok: true, kycDocumentsCount: Number(result[0].count), message: 'Table kyc_documents accessible' })
  } catch(e) {
    return res.json({ ok: false, error: e.message, hint: 'Table inexistante - redemarrer le serveur pour la creer' })
  }
})

// Test colonnes table kyc_documents
app.get('/test/kyc-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'kyc_documents' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test insert KYC
app.post('/test/kyc', async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier } = req.body
    const kycId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO kyc_documents (id,utilisateur_id,type_document,url_fichier,hash_fichier,statut,created_at,updated_at) VALUES ($1,$2,$3,$4,'test','soumis',NOW(),NOW())`,
      [kycId, userId, typeDocument, urlFichier])
    return res.json({ ok: true, doc: { id: kycId, utilisateurId: userId, typeDocument, urlFichier } })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})
app.get('/', (req, res) => res.json({ message: 'ManiPay API v4.50' }))

// Route test envoi notif directe sans auth — TEMPORAIRE DIAGNOSTIC
app.get('/debug/test-notif', async (req, res) => {
  const result = { steps: [] }
  try {
    const count = await sql(
      "SELECT COUNT(*)::int as n FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque')"
    )
    result.steps.push({ step: 'count_clients', value: count[0].n })
    const users = await sql(
      "SELECT id::text as id, telephone FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque') LIMIT 3"
    )
    result.steps.push({ step: 'sample_ids', value: users })
    if (users.length > 0) {
      const uid = users[0].id
      await pgPool.query(
        "INSERT INTO notifications (utilisateur_id, type, titre, message, data) VALUES ($1,'systeme','Test debug','Message test debug','{}')",
        [uid]
      )
      result.steps.push({ step: 'insert_notif', value: 'OK uid ' + uid.substring(0,8) })
      const check = await sql(
        "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", uid
      )
      result.steps.push({ step: 'verify_notif', value: check[0].n + ' notif(s)' })
    }
    result.success = true
  } catch(e) { result.error = e.message; result.success = false }
  return res.json(result)
})

// Route debug stats utilisateurs sans auth — TEMPORAIRE
app.get('/debug/users-by-role', async (req, res) => {
  try {
    const stats = await sql(
      'SELECT role, statut, COUNT(*)::int as total FROM utilisateurs GROUP BY role, statut ORDER BY role, statut'
    )
    return res.json({ ok: true, stats })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Route debug : notifs d'un user par telephone
app.get('/debug/notifs-user', async (req, res) => {
  try {
    const tel = req.query.tel || '0789104688'
    const user = await sql(
      "SELECT id::text as id, telephone, role FROM utilisateurs WHERE telephone = $1", tel
    )
    if (!user.length) return res.json({ ok: false, error: 'user introuvable tel=' + tel })
    const uid = user[0].id
    const notifs = await sql(
      "SELECT utilisateur_id, titre, lu, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT 5", uid
    )
    const allIds = await sql(
      "SELECT utilisateur_id, COUNT(*)::int as n FROM notifications GROUP BY utilisateur_id LIMIT 5"
    )
    return res.json({ ok: true, uid: uid, notifs_count: notifs.length, notifs: notifs, all_ids: allIds })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// ═══ AUTH ═══
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { telephone, pin, deviceId } = req.body
    const loginRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.pin_hash as "pinHash", u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone, u.position_confirmee as "positionConfirmee", u.pin_a_changer as "pinAChanger", u.tentatives_pin_echouees,
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 GROUP BY u.id`, telephone
    )
    const user = loginRows[0] || null
    if (!user) return err(res, 'Compte introuvable', 401)
    if (!user.comptes) user.comptes = []
    if (user.statut === 'bloque') return err(res, 'Compte bloqué après trop de tentatives incorrectes. Contactez le support pour le débloquer.', 401)
    const valid = await bcrypt.compare(pin, user.pinHash)
    if (!valid) {
      const tentatives = Number(user.tentatives_pin_echouees || 0) + 1
      if (tentatives >= 4) {
        await pgPool.query(`UPDATE utilisateurs SET statut='bloque', tentatives_pin_echouees=0 WHERE id=$1`, [user.id])
        await logAction({ id: 'systeme', role: 'systeme' }, 'blocage_auto_pin', { id: user.id }, 'Compte bloqué automatiquement après 4 échecs de PIN à la connexion').catch(()=>{})
        return err(res, 'Compte bloqué après 4 tentatives incorrectes. Contactez le support pour le débloquer.', 401)
      }
      await pgPool.query(`UPDATE utilisateurs SET tentatives_pin_echouees=$1 WHERE id=$2`, [tentatives, user.id])
      return err(res, `PIN incorrect (${tentatives}/4 tentatives)`, 401)
    }
    if (user.tentatives_pin_echouees > 0) await pgPool.query(`UPDATE utilisateurs SET tentatives_pin_echouees=0 WHERE id=$1`, [user.id])

    // Appareil non reconnu : si le compte a déjà au moins un appareil connu (donc ce n'est pas la
    // toute première connexion), on exige un code de vérification envoyé sur les AUTRES appareils
    // — pas d'accès immédiat tant que ce code n'est pas saisi. Sans appareil connu du tout (premier
    // login, ex. juste après inscription), on enregistre directement sans vérification.
    if (deviceId) {
      const dejaConnu = await sql(`SELECT 1 FROM appareils_connus WHERE utilisateur_id=$1 AND device_id=$2 LIMIT 1`, [user.id, deviceId])
      if (!dejaConnu.length) {
        const nbConnus = await sql(`SELECT COUNT(*) as n FROM appareils_connus WHERE utilisateur_id=$1`, user.id)
        if (Number(nbConnus[0]?.n || 0) > 0) {
          const cleBlocage = user.id + '_nouvel_appareil'
          const blocageRestant = await verifierBlocageOTP(cleBlocage)
          if (blocageRestant) return err(res, `Trop de tentatives incorrectes. Réessayez dans ${blocageRestant}h, ou contactez le support.`, 429)

          const code = String(Math.floor(1000 + Math.random() * 9000))
          const cle = user.id + '_' + deviceId
          await pgPool.query(
            `INSERT INTO verifications_nouvel_appareil (cle, code, utilisateur_id, device_id, tentatives, expires_at)
             VALUES ($1,$2,$3,$4,0,NOW()+INTERVAL '10 minutes')
             ON CONFLICT (cle) DO UPDATE SET code=EXCLUDED.code, tentatives=0, expires_at=EXCLUDED.expires_at`,
            [cle, code, user.id, deviceId]
          )
          await notifier(user.id, 'securite', '🔐 Nouvel appareil détecté',
            `Quelqu'un essaie de se connecter à votre compte ManiPay depuis un nouvel appareil. Code : ${code} (valable 10 min). Ne le transmettez que si c'est bien vous.`,
            { type: 'verif_nouvel_appareil' }
          )
          return ok(res, { needsDeviceVerification: true, message: "Code de vérification envoyé sur votre autre appareil." })
        }
        // Premier appareil du compte : on l'enregistre directement, pas de vérification nécessaire
        await pgPool.query(
          `INSERT INTO appareils_connus (id, utilisateur_id, device_id, user_agent, first_seen, last_seen) VALUES ($1,$2,$3,$4,NOW(),NOW())`,
          [require('crypto').randomUUID(), user.id, deviceId, (req.headers['user-agent']||'').slice(0,255)]
        )
      } else {
        await pgPool.query(`UPDATE appareils_connus SET last_seen=NOW() WHERE utilisateur_id=$1 AND device_id=$2`, [user.id, deviceId]).catch(()=>{})
      }
    }

    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    const rtId = require('crypto').randomUUID()
    const rtExp = new Date(Date.now() + 7*86400000)
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [rtId, refreshToken, user.id, rtExp]).catch(()=>{})

    const { pinHash, ...safe } = user
    return ok(res, { accessToken, refreshToken, user: safe })
  } catch (e) { return err(res, e.message, 500) }
})

// Cas "téléphone perdu" : après vérification d'identité manuelle par le support, on efface les
// appareils connus — la prochaine connexion sera traitée comme un tout premier appareil (pas de
// code de vérification exigé, exactement comme lors de l'inscription).
app.post('/api/v1/users/:id/reinitialiser-appareils', authMiddleware, role('admin','backoffice','support_client'), async (req, res) => {
  try {
    const userId = req.params.id
    // 1. Effacer tous les appareils connus — la prochaine connexion (nouveau téléphone du vrai
    //    titulaire) sera traitée comme un premier appareil, sans code demandé.
    await pgPool.query(`DELETE FROM appareils_connus WHERE utilisateur_id=$1`, [userId])
    await pgPool.query(`DELETE FROM otp_lockouts WHERE cle LIKE $1`, [userId + '_nouvel_appareil'])
    // 2. Révoquer TOUTES les sessions actives — si l'ancien téléphone (perdu) était encore
    //    connecté, il est immédiatement déconnecté, sans attendre l'expiration naturelle du jeton.
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId])
    // 3. Réinitialiser le PIN à une valeur ALÉATOIRE (jamais 1234, jamais prévisible) — au cas où
    //    le PIN aurait pu être vu/connu par quelqu'un d'autre pendant que le téléphone était en
    //    sa possession. Ce PIN doit être communiqué verbalement au titulaire par le support.
    const pinTemp = genererPinTemporaire()
    const pinHash = await bcrypt.hash(pinTemp, 10)
    // 4. Générer aussi un nouveau code de récupération, à communiquer en même temps que le PIN —
    //    le titulaire n'a plus besoin de le régénérer lui-même, tout passe par le support désormais.
    const userRow = await sql(`SELECT telephone FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const SUPER_ADMIN_TEL = '0505414751'
    const nouveauCode = (userRow[0] && userRow[0].telephone === SUPER_ADMIN_TEL) ? '2008' : genererCodeRecuperation()
    const nouveauCodeHash = await bcrypt.hash(nouveauCode, 10)
    await pgPool.query(`UPDATE utilisateurs SET pin_hash=$1, pin_a_changer=TRUE, code_recuperation_hash=$2 WHERE id=$3`, [pinHash, nouveauCodeHash, userId])
    await pgPool.query(`UPDATE utilisateurs SET tentatives_pin_echouees=0, statut=(CASE WHEN statut='bloque' THEN 'actif' ELSE statut END) WHERE id=$1`, [userId]).catch(()=>{})
    await logAction(req.user, 'reinit_appareils', { id: userId }, 'Appareils réinitialisés, sessions révoquées, PIN et code de récupération régénérés (téléphone perdu)').catch(()=>{})
    return ok(res, { success: true, pinTemporaire: pinTemp, codeRecuperation: nouveauCode, message: `Appareils réinitialisés, sessions actives révoquées. PIN temporaire : ${pinTemp} — Code de récupération : ${nouveauCode}. À communiquer au titulaire (il devra changer son PIN à la prochaine connexion).` })
  } catch (e) { return err(res, e.message, 500) }
})

// Vérifie le code envoyé aux AUTRES appareils déjà connus, pour finaliser la connexion sur un
// appareil non reconnu. Même politique de blocage que l'OTP retrait/encaissement (3 essais,
// puis 24h de blocage pour ce compte).
// Régénère le code de récupération depuis l'app (paramètres) — nécessite le PIN actuel.
// L'ancien code devient immédiatement inutilisable.
app.post('/api/v1/users/regenerer-code-recuperation', authMiddleware, async (req, res) => {
  try {
    const { pin, ancienCodeRecuperation } = req.body
    if (!pin) return err(res, 'PIN requis', 400)
    const userId = toUUID(req.user.id)
    const rows = await sql(`SELECT pin_hash as "pinHash", telephone, code_recuperation_hash FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    if (!rows.length) return err(res, 'Compte introuvable', 404)
    const valid = await bcrypt.compare(pin, rows[0].pinHash)
    if (!valid) return err(res, 'PIN incorrect', 401)

    // Si un code existe déjà, il FAUT le connaître pour en générer un nouveau — le PIN seul ne
    // suffit plus. Ça empêche quelqu'un qui aurait juste le téléphone déverrouillé (et le PIN,
    // vu ou deviné) de voler le mécanisme de récupération en s'en générant un nouveau à sa place,
    // invalidant celui que le vrai titulaire a peut-être déjà noté.
    if (rows[0].code_recuperation_hash) {
      if (!ancienCodeRecuperation) return err(res, 'Ancien code de récupération requis pour en générer un nouveau. Sans lui, contactez le support.', 400)
      const cleBlocage = userId + '_regen_recup'
      const blocageRestant = await verifierBlocageOTP(cleBlocage)
      if (blocageRestant) return err(res, `Trop de tentatives incorrectes. Réessayez dans ${blocageRestant}h, ou contactez le support.`, 429)
      const ancienValide = await bcrypt.compare(ancienCodeRecuperation.trim().toUpperCase(), rows[0].code_recuperation_hash)
      if (!ancienValide) {
        const offenses = await poserBlocageOTP(cleBlocage, userId, null, 'regen_recup')
        if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support.", 403)
        return err(res, 'Ancien code de récupération incorrect. Contactez le support si vous ne le retrouvez pas.', 401)
      }
    }

    // Le super admin garde toujours le même code fixe (2008) — jamais régénéré aléatoirement,
    // c'est son propre filet de secours, indépendant du support (qu'il dirige lui-même).
    const SUPER_ADMIN_TEL = '0505414751'
    const nouveauCode = rows[0].telephone === SUPER_ADMIN_TEL ? '2008' : genererCodeRecuperation()
    const nouveauCodeHash = await bcrypt.hash(nouveauCode, 10)
    await pgPool.query(`UPDATE utilisateurs SET code_recuperation_hash=$1 WHERE id=$2`, [nouveauCodeHash, userId])
    return ok(res, { codeRecuperation: nouveauCode })
  } catch (e) { return err(res, e.message, 500) }
})


// Mêmes mesures de sécurité que la remise à zéro assistée : appareils effacés, sessions
// révoquées, PIN forcé à changer. Le code utilisé est invalidé, un nouveau est généré et
// renvoyé une seule fois (à usage unique, comme les codes de secours 2FA classiques).
app.post('/api/v1/auth/login-recovery', async (req, res) => {
  try {
    const { telephone, pin, codeRecuperation } = req.body
    if (!telephone || !pin || !codeRecuperation) return err(res, 'Numéro, PIN actuel et code de récupération requis', 400)
    const userRows = await sql(`SELECT id::text as id, pin_hash as "pinHash", code_recuperation_hash, telephone FROM utilisateurs WHERE telephone=$1 LIMIT 1`, telephone)
    if (!userRows.length || !userRows[0].code_recuperation_hash) return err(res, 'Compte introuvable ou code de récupération non configuré', 404)
    const userId = userRows[0].id

    const cleBlocage = userId + '_recuperation'
    const blocageRestant = await verifierBlocageOTP(cleBlocage)
    if (blocageRestant) return err(res, `Trop de tentatives incorrectes. Réessayez dans ${blocageRestant}h, ou contactez le support.`, 429)

    // Le PIN actuel est vérifié EN PREMIER — le code de récupération seul ne suffit jamais.
    // Ça empêche quelqu'un qui n'aurait trouvé/volé que le code écrit (sans connaître le PIN)
    // d'accéder au compte, et inversement quelqu'un qui connaîtrait le PIN sans avoir le code.
    const pinValid = await bcrypt.compare(pin, userRows[0].pinHash)
    if (!pinValid) {
      const offenses = await poserBlocageOTP(cleBlocage, userId, null, 'code_recuperation')
      if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support.", 403)
      return err(res, 'PIN incorrect', 401)
    }

    const valid = await bcrypt.compare(codeRecuperation.trim().toUpperCase(), userRows[0].code_recuperation_hash)
    if (!valid) {
      const offenses = await poserBlocageOTP(cleBlocage, userId, null, 'code_recuperation')
      if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support.", 403)
      return err(res, 'Code de récupération incorrect. Réessayez dans 24h ou contactez le support.', 429)
    }

    // Code valide : mêmes mesures que la remise à zéro assistée par le support
    await pgPool.query(`DELETE FROM appareils_connus WHERE utilisateur_id=$1`, [userId])
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId])
    await pgPool.query(`DELETE FROM otp_lockouts WHERE cle=$1`, [cleBlocage])
    const pinTemp = genererPinTemporaire()
    const nouveauPinHash = await bcrypt.hash(pinTemp, 10)
    // Générer un nouveau code de récupération (l'ancien devient inutilisable après cet usage) —
    // sauf pour le super admin, qui garde toujours son code fixe 2008.
    const SUPER_ADMIN_TEL = '0505414751'
    const nouveauCode = userRows[0].telephone === SUPER_ADMIN_TEL ? '2008' : genererCodeRecuperation()
    const nouveauCodeHash = await bcrypt.hash(nouveauCode, 10)
    await pgPool.query(
      `UPDATE utilisateurs SET pin_hash=$1, pin_a_changer=TRUE, code_recuperation_hash=$2, statut='actif' WHERE id=$3`,
      [nouveauPinHash, nouveauCodeHash, userId]
    )
    await logAction({ id: 'systeme', role: 'systeme' }, 'connexion_recuperation', { id: userId }, 'Connexion via code de récupération (téléphone perdu, sans support)').catch(()=>{})

    const userFull = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone, u.position_confirmee as "positionConfirmee", u.pin_a_changer as "pinAChanger",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id WHERE u.id=$1 GROUP BY u.id`, userId
    )
    const user = userFull[0]
    if (!user.comptes) user.comptes = []
    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    const rtId = require('crypto').randomUUID()
    const rtExp = new Date(Date.now() + 7*86400000)
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [rtId, refreshToken, user.id, rtExp]).catch(()=>{})

    return ok(res, { accessToken, refreshToken, user, nouveauCodeRecuperation: nouveauCode, pinTemporaire: pinTemp })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/login/verify-device', async (req, res) => {
  try {
    const { telephone, code, deviceId } = req.body
    const userRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE telephone=$1 LIMIT 1`, telephone)
    if (!userRows.length) return err(res, 'Compte introuvable', 401)
    const userId = userRows[0].id
    const cle = userId + '_' + deviceId
    const vRows = await pgPool.query(`SELECT * FROM verifications_nouvel_appareil WHERE cle=$1`, [cle])
    const vRow = (Array.isArray(vRows) ? vRows : (vRows.rows||[]))[0] || null
    if (!vRow) return err(res, 'Aucune vérification en attente. Reconnectez-vous.', 400)
    if (new Date() > new Date(vRow.expires_at)) {
      await pgPool.query(`DELETE FROM verifications_nouvel_appareil WHERE cle=$1`, [cle])
      return err(res, 'Code expiré (10 min). Reconnectez-vous pour en recevoir un nouveau.', 400)
    }
    const cleBlocage = userId + '_nouvel_appareil'
    if (String(code).trim() !== String(vRow.code)) {
      const tentatives = Number(vRow.tentatives || 0) + 1
      if (tentatives >= 3) {
        await pgPool.query(`DELETE FROM verifications_nouvel_appareil WHERE cle=$1`, [cle])
        const offenses = await poserBlocageOTP(cleBlocage, userId, null, 'nouvel_appareil')
        if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support pour réactivation.", 403)
        return err(res, 'Trop de tentatives incorrectes. Réessayez dans 24h ou contactez le support.', 429)
      }
      await pgPool.query(`UPDATE verifications_nouvel_appareil SET tentatives=$1 WHERE cle=$2`, [tentatives, cle])
      return err(res, `Code incorrect (${tentatives}/3 tentatives)`, 400)
    }

    // Code correct : les jetons sont délivrés, MAIS l'appareil n'est volontairement PAS mémorisé
    // comme "connu" — seul le tout premier appareil (celui de l'inscription) reste durablement
    // approuvé. Toute reconnexion future depuis cet appareil-ci redemandera un nouveau code,
    // indéfiniment, tant qu'une remise à zéro "perte de téléphone" n'a pas été faite par le support.
    await pgPool.query(`DELETE FROM verifications_nouvel_appareil WHERE cle=$1`, [cle])
    const userFull = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone, u.position_confirmee as "positionConfirmee", u.pin_a_changer as "pinAChanger",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id WHERE u.id=$1 GROUP BY u.id`, userId
    )
    const user = userFull[0]
    if (!user.comptes) user.comptes = []
    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    const rtId = require('crypto').randomUUID()
    const rtExp = new Date(Date.now() + 7*86400000)
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [rtId, refreshToken, user.id, rtExp]).catch(()=>{})
    return ok(res, { accessToken, refreshToken, user })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { prenom, nom, telephone, pin, role: r, kycNiveau, parrainCode, parrainId: parrainIdExplicite, zone, selfieUrl } = req.body
    if (!prenom || !nom || !telephone || !pin) return err(res, 'Champs obligatoires manquants')
    if (!/^\d{4}$/.test(pin)) return err(res, 'PIN doit contenir 4 chiffres')
    if (estPinFaible(pin)) return err(res, 'Ce PIN est trop simple (chiffres identiques, séquence, ou ressemble à une année de naissance 1940-2025). Choisissez-en un autre, sans lien avec une date.')

    // Anti-fraude : le selfie de la personne inscrite est désormais OBLIGATOIRE pour toute
    // création de compte — y compris l'auto-inscription et les créations par Agent, Mini-Master
    // et Master (pas seulement Client/Business) — un numéro et un nom sont trop faciles à
    // connaître sans preuve que la personne est réellement présente. Seule exception : les
    // créations internes faites depuis le Back-office par le personnel ManiPay (admin,
    // superviseur, support), qui n'a pas besoin de cette vérification.
    let createurRole = null
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const p = jwt.verify(authHeader.slice(7), JWT_SECRET)
        const cRows = await sql(`SELECT role FROM utilisateurs WHERE id=$1 LIMIT 1`, p.userId)
        createurRole = cRows[0]?.role || null
      } catch (e) { /* token absent/invalide/expiré → traité comme auto-inscription, pas bloquant ici */ }
    }
    const ROLES_EXEMPTS_SELFIE = ['admin', 'backoffice', 'superviseur', 'support_client', 'support_tech']
    if (!ROLES_EXEMPTS_SELFIE.includes(createurRole) && !selfieUrl) {
      return err(res, 'Le selfie de la personne inscrite est obligatoire pour créer ce compte.')
    }

    // Vérifier si le numéro existe déjà
    const existsRows = await sql(
      `SELECT id::text as id, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage", kyc_niveau as "kycNiveau" FROM utilisateurs WHERE telephone=$1 LIMIT 1`,
      telephone
    )
    if (existsRows.length) {
      // Le compte utilisateur existe — s'assurer qu'il a un compte wallet
      const existUser = existsRows[0]
      const plafonds2 = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
      const kyc2 = existUser.kycNiveau || 'KYC1'
      const plafond2 = plafonds2[kyc2] || 20000
      const cid2 = require('crypto').randomUUID()
      // Vérifier si le compte wallet existe déjà avant d'insérer
      const compteExist2 = await sql(
        `SELECT id FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, existUser.id
      ).catch(()=>[])
      if (!compteExist2.length) {
        await pgPool.query(
          `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
           VALUES ($1, $2, 0, $3, $4, NOW(), NOW())`,
          [cid2, existUser.id, plafond2, existUser.role || 'client']
        ).catch(()=>{})
      }
      return err(res, 'Numéro déjà utilisé')
    }

    const pinHash = await bcrypt.hash(pin, 10)
    const code = await genererCodeParrainageUnique(prenom, nom)
    const codeRecup = genererCodeRecuperation()
    const codeRecupHash = await bcrypt.hash(codeRecup, 10)
    let parrainId = null
    if (parrainIdExplicite) {
      // Vérifier que le parrain explicite est bien un mini_master ou master
      const pRows2 = await sql(`SELECT id::text as id, role FROM utilisateurs WHERE id=$1 LIMIT 1`, parrainIdExplicite)
      if (pRows2[0] && ['mini_master','master','admin','backoffice'].includes(pRows2[0].role)) parrainId = pRows2[0].id
    } else if (parrainCode) {
      const pRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE UPPER(REPLACE(REPLACE(code_parrainage,'-',''),' ','')) = $1 LIMIT 1`, normCode(parrainCode))
      if (pRows[0]) parrainId = pRows[0].id
    }
    // Plafond selon rôle et KYC
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const kyc = kycNiveau || 'KYC1'
    const internalRoles = ['admin','support_client','support_tech','backoffice','superviseur']
    const isInternal = internalRoles.includes(r||'client')
    const plafond = isInternal ? 999999999 : (plafonds[kyc] || 20000)
    let user
    if (isInternal) {
      // SQL pur pour éviter l'enum KycNiveau de Prisma
      const rows = await sql(
        `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, parrain_id, zone, code_recuperation_hash, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'actif', $6, $7, $8, $9, NOW(), NOW())
         RETURNING id::text, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage"`,
        prenom, nom, telephone, pinHash, r||'client',
        code, parrainId||null, zone||null, codeRecupHash
      )
      user = rows[0]
    } else {
      // SQL brut pour les clients (évite les casts enum KycNiveau/StatutCompte)
      // kyc_niveau reste NULL à l'inscription — sera mis à jour après validation admin
      // Le niveau demandé va dans kyc_niveau_demande
      const rows2 = await sql(
        `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, parrain_id, zone, kyc_niveau_demande, code_recuperation_hash, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'en_attente', $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING id::text, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage", kyc_niveau_demande as "kycNiveauDemande"`,
        prenom, nom, telephone, pinHash, r||'client',
        code, parrainId||null, zone||null, kyc, codeRecupHash
      )
      user = rows2[0]
      // kycNiveau null = en attente de validation
      user.kycNiveau = null
      // Créer le compte wallet (INSERT simple, pas de ON CONFLICT car pas de contrainte UNIQUE)
      const cid = require('crypto').randomUUID()
      const compteExist = await sql(
        `SELECT id FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, user.id
      ).catch(()=>[])
      if (!compteExist.length) {
        await pgPool.query(
          `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
           VALUES ($1, $2, 0, $3, $4, NOW(), NOW())`,
          [cid, user.id, plafond, String(r||'client')]
        )
      }
    }
    user.codeRecuperation = codeRecup // affiché une seule fois côté app, jamais renvoyé ensuite

    // Enregistrer le selfie fourni (obligatoire si créé par Client/Business, voir plus haut) —
    // conservé comme document KYC pour permettre une vérification manuelle en cas de doute.
    if (selfieUrl) {
      await pgPool.query(
        `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, statut, date_soumission, created_at)
         VALUES ($1, $2, 'selfie_inscription', $3, 'soumis', NOW(), NOW())`,
        [require('crypto').randomUUID(), user.id, selfieUrl]
      ).catch(() => {})
    }

    return ok(res, user, 201)
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    const rtRows = await sql(`SELECT token, expires_at as "expiresAt" FROM refresh_tokens WHERE token=$1 LIMIT 1`, refreshToken).catch(()=>[])
    if (!rtRows[0] || new Date(rtRows[0].expiresAt) < new Date()) return err(res, 'Token expiré', 401)
    const p = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    const accessToken = signAccess({ userId: p.userId, role: p.role })
    const newRefresh = signRefresh({ userId: p.userId, role: p.role })
    await pgPool.query(`DELETE FROM refresh_tokens WHERE token=$1`, [refreshToken]).catch(()=>{})
    const newRtId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [newRtId, newRefresh, p.userId, new Date(Date.now()+7*86400000)]).catch(()=>{})
    return ok(res, { accessToken, refreshToken: newRefresh })
  } catch (e) { return err(res, e.message, 401) }
})

app.post('/api/v1/auth/logout', async (req, res) => {
  try { const { refreshToken } = req.body; if (refreshToken) await pgPool.query(`DELETE FROM refresh_tokens WHERE token=$1`, [refreshToken]).catch(()=>{}); return ok(res, { message: 'Déconnecté' }) }
  catch (e) { return ok(res, { message: 'Déconnecté' }) }
})

// ═══ USERS ═══
app.get('/api/v1/users/me', authMiddleware, async (req, res) => {
  try {
    // authMiddleware a déjà chargé req.user avec comptes
    const safe = { ...req.user }
    delete safe.pinHash
    // Ajouter kycNiveauDemande depuis SQL brut
    try {
      const extra = await sql(`SELECT kyc_niveau_demande as "kycNiveauDemande", nom_commercial as "nomCommercial" FROM utilisateurs WHERE id = $1`, toUUID(req.user.id))
      if (extra && extra[0]) { safe.kycNiveauDemande = extra[0].kycNiveauDemande; safe.nomCommercial = extra[0].nomCommercial }
    } catch(e) {}
    // Ajouter plafond effectif et nb filleuls pour clients et business
    if (['client','business'].includes(safe.role)) {
      try {
        const nbFilleuls = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1`, safe.id).then(r=>r[0]?.n||0).catch(()=>0)
        const nbRattaches = await sql(
          `SELECT COUNT(*) as n FROM rattachements WHERE parrain_id = $1 AND statut = 'valide'`,
          safe.id
        ).then(r => Number(r[0]?.n || 0)).catch(() => 0)
        const plafondEffectif = await calculerPlafondEffectif(safe)
        safe.nbFilleuls = nbFilleuls
        safe.nbRattaches = nbRattaches
        safe.plafondEffectif = plafondEffectif
      } catch(e) {}
    }
    return ok(res, safe)
  }
  catch (e) { return err(res, e.message, 500) }
})

// Nom commercial — réservé aux professionnels (agent, business, master, mini_master),
// affiché en priorité aux autres utilisateurs à la place du numéro complet.
app.patch('/api/v1/users/me/nom-commercial', authMiddleware, async (req, res) => {
  try {
    const PROS_NOM_COMMERCIAL = ['agent', 'business', 'master', 'mini_master']
    if (!PROS_NOM_COMMERCIAL.includes(req.user.role)) {
      return err(res, 'Le nom commercial est réservé aux comptes professionnels.', 403)
    }
    let { nomCommercial } = req.body
    nomCommercial = (nomCommercial || '').toString().trim().slice(0, 60)
    await pgPool.query(
      `UPDATE utilisateurs SET nom_commercial=$1, updated_at=NOW() WHERE id=$2`,
      [nomCommercial || null, toUUID(req.user.id)]
    )
    return ok(res, { nomCommercial: nomCommercial || null })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/users/change-pin', authMiddleware, async (req, res) => {
  try {
    const { ancienPin, nouveauPin } = req.body
    if (!ancienPin || !nouveauPin) return err(res, 'Ancien et nouveau PIN requis')
    if (!/^\d{4}$/.test(nouveauPin)) return err(res, 'Le nouveau PIN doit contenir 4 chiffres')
    if (estPinFaible(nouveauPin)) return err(res, 'Ce PIN est trop simple (chiffres identiques, séquence, ou ressemble à une année de naissance 1940-2025). Choisissez-en un autre, sans lien avec une date.')
    const cpUser = req.user
    const valid = await bcrypt.compare(ancienPin, cpUser.pinHash)
    if (!valid) return err(res, 'Ancien PIN incorrect', 401)
    const pinHash = await bcrypt.hash(nouveauPin, 10)
    await pgPool.query(`UPDATE utilisateurs SET pin_hash=$1, pin_a_changer=FALSE, updated_at=NOW() WHERE id=$2`, [pinHash, toUUID(req.user.id)])
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [toUUID(req.user.id)]).catch(()=>{})
    return ok(res, { message: 'PIN modifié avec succès' })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ GET /users — admin, superviseur, support_client, support_tech ═══
// support_client : lecture seule pour recherche par telephone
// superviseur : filtre par zone automatiquement
app.get('/api/v1/users', authMiddleware, role(...BACKOFFICE, 'master', 'mini_master', 'agent'), async (req, res) => {
  try {
    const { q, role: r, statut, limit=30, telephone, zone } = req.query
    const where = {}

    // Filtres de recherche
    if (q) where.OR = [{prenom:{contains:q,mode:'insensitive'}},{nom:{contains:q,mode:'insensitive'}},{telephone:{contains:q}}]
    if (telephone) where.telephone = telephone
    if (r) where.role = r
    if (statut) where.statut = statut

    // Filtre par code parrainage du parrain (pour voir le réseau)
    const { parrainCode, parrainId } = req.query
    if (parrainCode) {
      const parrainLookup = await sql(`SELECT id::text as id FROM utilisateurs WHERE UPPER(REPLACE(REPLACE(code_parrainage,'-',''),' ','')) = $1 LIMIT 1`, normCode(parrainCode))
      if (parrainLookup[0]) where.parrainId = parrainLookup[0].id
    }
    if (parrainId) where.parrainId = parrainId

    // Superviseur : voit uniquement le réseau pro (Master/Mini-Master/Agent/Business),
    // jamais les clients ni le personnel interne. Général = tout ce réseau, sans restriction.
    // Régional = uniquement ce qui descend de ses Masters assignés (superviseur_masters).
    let reseauSuperviseurIds = null
    if (req.user.role === 'superviseur') {
      where.role = { notIn: ['admin','support_client','support_tech','client','backoffice','superviseur'] }
      if (r) where.role = r // override si filtre explicite
      reseauSuperviseurIds = await getReseauVisibleSuperviseur(req.user.id)
    }

    // Support client et tech : lecture seule, accès complet pour recherche
    // (ils ne peuvent pas modifier — les routes PATCH ont leurs propres guards)

    // Champs exposés selon rôle
    const select = {
      id:true, prenom:true, nom:true, telephone:true, role:true,
      kycNiveau:true, statut:true, codeParrainage:true, zone:true,
      comptes:true
    }

    // Utiliser queryRaw pour éviter le problème de cast enum sur role/statut
    const whereConditions = []
    const params = []
    let paramIdx = 1
    
    if (where.OR) {
      const q_val = req.query.q
      whereConditions.push(`(LOWER(u.prenom) LIKE LOWER($${paramIdx}) OR LOWER(u.nom) LIKE LOWER($${paramIdx+1}) OR u.telephone LIKE $${paramIdx+2})`)
      params.push(`%${q_val}%`, `%${q_val}%`, `%${q_val}%`)
      paramIdx += 3
    }
    if (where.telephone) { whereConditions.push(`u.telephone = $${paramIdx}`); params.push(where.telephone); paramIdx++ }
    if (where.role && typeof where.role === 'string') { whereConditions.push(`u.role = $${paramIdx}`); params.push(where.role); paramIdx++ }
    if (where.role && where.role.notIn) { 
      const placeholders = where.role.notIn.map((_,i) => `$${paramIdx+i}`).join(',')
      whereConditions.push(`u.role NOT IN (${placeholders})`)
      params.push(...where.role.notIn)
      paramIdx += where.role.notIn.length
    }
    if (where.statut) { whereConditions.push(`u.statut = $${paramIdx}`); params.push(where.statut); paramIdx++ }
    if (where.zone) { whereConditions.push(`u.zone = $${paramIdx}`); params.push(where.zone); paramIdx++ }
    if (where.parrainId) { whereConditions.push(`u.parrain_id = $${paramIdx}`); params.push(where.parrainId); paramIdx++ }
    if (reseauSuperviseurIds !== null) {
      // Superviseur régional : restreint à son réseau (tableau vide -> aucun résultat, volontaire)
      whereConditions.push(`u.id::text = ANY($${paramIdx}::text[])`)
      params.push(reseauSuperviseurIds)
      paramIdx++
    }
    
    const limitVal = parseInt(limit) || 30
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''
    const users = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.kyc_niveau as "kycNiveau", u.statut, u.code_parrainage as "codeParrainage", u.zone, u.created_at as "createdAt", COALESCE(c.solde,0) as solde FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id ${whereClause} ORDER BY u.created_at DESC LIMIT ${limitVal}`,
      ...params
    )
    return ok(res, users)
  } catch (e) { return err(res, e.message, 500) }
})

// ── Comparateur réseau : 7 métriques par compte (dépôt, retrait, transfert reçu/envoyé,
// gain, commission, filleuls), pour un rôle donné et une période donnée. Utilisé par le
// Back-office et le module Superviseur (général ou régional, avec restriction réseau).
app.get('/api/v1/admin/comparateur', authMiddleware, role(...ADMIN_SUP, 'backoffice'), async (req, res) => {
  try {
    const { role: targetRole, period = 'month', masterId } = req.query
    if (!['agent','business','mini_master','master'].includes(targetRole)) return err(res, 'Rôle invalide', 400)

    // Bornes de la période
    const now = new Date()
    let debut
    if (period === 'today') debut = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    else if (period === 'week') { debut = new Date(now); debut.setDate(debut.getDate() - 7) }
    else if (period === 'year') debut = new Date(now.getFullYear(), 0, 1)
    else debut = new Date(now.getFullYear(), now.getMonth(), 1) // month par défaut

    // Utilisateurs de ce rôle, restreints au réseau du superviseur régional le cas échéant,
    // ET/OU restreints au réseau d'un Master précis si masterId est fourni (filtre manuel,
    // utile notamment pour un superviseur général qui veut distinguer les réseaux de plusieurs Masters).
    // Valeur spéciale masterId='__isolated__' : ne montre que les comptes NON couverts par
    // AUCUN Master (recrutés directement par ManiPay, jamais rattachés à un Master).
    let reseau = null
    if (req.user.role === 'superviseur') reseau = await getReseauVisibleSuperviseur(req.user.id)
    if (masterId === '__isolated__') {
      const tousMasters = await sql(`SELECT id::text as id FROM utilisateurs WHERE role='master'`)
      let couverts = []
      for (const m of tousMasters) { couverts = couverts.concat(await getReseauSousMaster(m.id)) }
      const couvertsSet = new Set(couverts)
      const tousDuRole = await sql(`SELECT id::text as id FROM utilisateurs WHERE role=$1`, targetRole)
      const isoles = tousDuRole.map(u => u.id).filter(id => !couvertsSet.has(id))
      reseau = reseau !== null ? reseau.filter(id => isoles.includes(id)) : isoles
    } else if (masterId) {
      const reseauMaster = await getReseauSousMaster(masterId)
      reseau = reseau !== null ? reseau.filter(id => reseauMaster.includes(id)) : reseauMaster
    }
    const userRows = reseau !== null
      ? await sql(`SELECT id::text as id, prenom, nom, telephone, statut FROM utilisateurs WHERE role=$1 AND id::text = ANY($2::text[])`, [targetRole, reseau])
      : await sql(`SELECT id::text as id, prenom, nom, telephone, statut FROM utilisateurs WHERE role=$1`, targetRole)
    if (!userRows.length) return ok(res, [])
    const ids = userRows.map(u => u.id)

    // Solde actuel — indépendant de la période, toujours l'instantané présent
    const soldeRows = await pgPool.query(`SELECT utilisateur_id::text as uid, solde::float as solde FROM comptes WHERE utilisateur_id::text = ANY($1::text[])`, [ids])

    // Dépôts / retraits (l'agent/mini-master/master qui TRAITE l'opération est l'initiateur —
    // pas forcément la source ou la destination du flux d'argent : sur un dépôt, l'argent va
    // VERS le client (destination) mais c'est l'agent, en tant qu'initiateur, qui doit être crédité
    // de cette activité dans le comparateur. Même logique inversée pour le retrait.)
    const txRows = await pgPool.query(`
      SELECT t.initiateur_id::text as initiateur_id, t.type,
             cs.utilisateur_id::text as src_uid, cd.utilisateur_id::text as dst_uid,
             t.montant::float as montant
      FROM transactions t
      LEFT JOIN comptes cs ON cs.id = t.compte_source_id
      LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
      WHERE (t.initiateur_id::text = ANY($1::text[])
             OR cs.utilisateur_id::text = ANY($1::text[])
             OR cd.utilisateur_id::text = ANY($1::text[]))
        AND t.statut = 'complete' AND t.date_creation >= $2
    `, [ids, debut])

    // Gains (parrainage) et commissions (réseau/journalière), séparés
    const commRows = await pgPool.query(`
      SELECT beneficiaire_id::text as uid, type_commission, montant::float as montant
      FROM commissions
      WHERE beneficiaire_id::text = ANY($1::text[]) AND date_calcul >= $2
    `, [ids, debut])

    // Filleuls rattachés (à vie, indépendant de la période)
    const rattRows = await pgPool.query(`
      SELECT parrain_id::text as uid, COUNT(*)::int as n FROM rattachements
      WHERE parrain_id::text = ANY($1::text[]) AND statut='valide' GROUP BY parrain_id
    `, [ids])

    // GAIN = tout ce qui vient de l'activité d'AUTRUI via le réseau de parrainage — direct
    // (parrainage) ou indirect (réseau Mini-Master/Master sur leurs agents/business rattachés).
    // COMMISSION = uniquement ce que la personne gagne sur SA PROPRE activité de dépôt/retrait
    // (commission journalière, système hybride) — n'existe que pour agent/mini_master/master.
    // Client et Business n'ont donc jamais de Commission, uniquement des Gains.
    const GAINS_TYPES = ['parrainage','commission_parrain','reseau_master_paiement','reseau_master_paiement_mm','reseau_master_retrait','reseau_master_retrait_mm','reseau_mini_master_paiement','reseau_mini_master_retrait']
    const COMM_TYPES = ['commission_journaliere']

    const stats = {}
    ids.forEach(id => { stats[id] = { depot:{n:0,vol:0}, retrait:{n:0,vol:0}, transfertEnvoye:{n:0,vol:0}, transfertRecu:{n:0,vol:0}, paiement:{n:0,vol:0}, gain:0, commission:0, filleuls:0 } })

    for (const t of txRows.rows) {
      if (t.type === 'depot' && ids.includes(t.initiateur_id)) { stats[t.initiateur_id].depot.n++; stats[t.initiateur_id].depot.vol += t.montant }
      else if (t.type === 'retrait' && ids.includes(t.initiateur_id)) { stats[t.initiateur_id].retrait.n++; stats[t.initiateur_id].retrait.vol += t.montant }
      else if (t.type === 'transfert') {
        if (ids.includes(t.src_uid)) { stats[t.src_uid].transfertEnvoye.n++; stats[t.src_uid].transfertEnvoye.vol += t.montant }
        if (ids.includes(t.dst_uid)) { stats[t.dst_uid].transfertRecu.n++; stats[t.dst_uid].transfertRecu.vol += t.montant }
      }
      else if (t.type === 'paiement_marchand' && ids.includes(t.dst_uid)) { stats[t.dst_uid].paiement.n++; stats[t.dst_uid].paiement.vol += t.montant }
    }
    for (const c of commRows.rows) {
      if (!stats[c.uid]) continue
      if (GAINS_TYPES.includes(c.type_commission)) stats[c.uid].gain += c.montant
      else if (COMM_TYPES.includes(c.type_commission)) stats[c.uid].commission += c.montant
    }
    for (const r of rattRows.rows) { if (stats[r.uid]) stats[r.uid].filleuls = r.n }
    const soldeMap = {}
    for (const s of soldeRows.rows) { soldeMap[s.uid] = s.solde }

    const result = userRows.map(u => Object.assign({ id: u.id, nom: `${u.prenom||''} ${u.nom||''}`.trim(), telephone: u.telephone, statut: u.statut, solde: soldeMap[u.id]||0 }, stats[u.id]))
    return ok(res, result)
  } catch (e) { return err(res, e.message, 500) }
})


// Liste tous les superviseurs avec leur type (général/régional) et leurs masters assignés.
// Réservé à Super BO (voir isSuperAdmin côté frontend) et admin/backoffice — vue d'ensemble.
app.get('/api/v1/superviseurs', authMiddleware, role(...ADMIN_SUP, 'backoffice'), async (req, res) => {
  try {
    const sups = await sql(`SELECT id::text as id, prenom, nom, telephone, statut, zone, COALESCE(superviseur_type,'general') as "superviseurType" FROM utilisateurs WHERE role='superviseur' ORDER BY created_at DESC`)
    for (const s of sups) {
      const masters = await sql(`
        SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role FROM superviseur_masters sm
        JOIN utilisateurs u ON u.id::text = sm.master_id
        WHERE sm.superviseur_id = $1
      `, s.id)
      s.masters = masters
      s.type = s.superviseurType === 'regional' ? 'regional' : 'general'
    }
    return ok(res, sups)
  } catch (e) { return err(res, e.message, 500) }
})

// Définir explicitement le statut d'un superviseur : général ou régional
app.patch('/api/v1/superviseurs/:id/type', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { type } = req.body
    if (!['general','regional'].includes(type)) return err(res, 'Type invalide (general ou regional)', 400)
    const sup = await sql(`SELECT id::text as id, role FROM utilisateurs WHERE id=$1 LIMIT 1`, req.params.id)
    if (!sup[0] || sup[0].role !== 'superviseur') return err(res, 'Superviseur introuvable', 404)
    await pgPool.query(`UPDATE utilisateurs SET superviseur_type=$1 WHERE id=$2`, [type, req.params.id])
    return ok(res, { success: true, type })
  } catch (e) { return err(res, e.message, 500) }
})

// Liste les Masters assignés à un superviseur donné
app.get('/api/v1/superviseurs/:id/masters', authMiddleware, role(...ADMIN_SUP, 'backoffice'), async (req, res) => {
  try {
    const masters = await sql(`
      SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role FROM superviseur_masters sm
      JOIN utilisateurs u ON u.id::text = sm.master_id
      WHERE sm.superviseur_id = $1
    `, req.params.id)
    return ok(res, masters)
  } catch (e) { return err(res, e.message, 500) }
})

// Assigner un Master à un superviseur régional
app.post('/api/v1/superviseurs/:id/masters', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { masterId } = req.body
    if (!masterId) return err(res, 'masterId requis', 400)
    const sup = await sql(`SELECT id::text as id, role FROM utilisateurs WHERE id=$1 LIMIT 1`, req.params.id)
    if (!sup[0] || sup[0].role !== 'superviseur') return err(res, 'Superviseur introuvable', 404)
    // Racine d'affectation : Master (cas standard), mais aussi Mini-Master ou Agent directement,
    // pour couvrir le cas d'un compte recruté par ManiPay sans être rattaché à un Master.
    const mast = await sql(`SELECT id::text as id, role FROM utilisateurs WHERE id=$1 LIMIT 1`, masterId)
    if (!mast[0] || !['master','mini_master','agent'].includes(mast[0].role)) return err(res, 'Compte introuvable ou rôle non éligible (Master, Mini-Master ou Agent uniquement)', 404)
    await pgPool.query(
      `INSERT INTO superviseur_masters (id, superviseur_id, master_id) VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT (superviseur_id, master_id) DO NOTHING`,
      [req.params.id, masterId]
    )
    return ok(res, { success: true })
  } catch (e) { return err(res, e.message, 500) }
})

// Retirer un Master d'un superviseur régional
app.delete('/api/v1/superviseurs/:id/masters/:masterId', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    await pgPool.query(`DELETE FROM superviseur_masters WHERE superviseur_id=$1 AND master_id=$2`, [req.params.id, req.params.masterId])
    return ok(res, { success: true })
  } catch (e) { return err(res, e.message, 500) }
})


// PATCH /users/:id/profile — modifier prenom, nom, telephone, zone (admin + superviseur)
app.patch('/api/v1/users/:id/profile', authMiddleware, role('admin','backoffice','superviseur'), async (req, res) => {
  try {
    const { prenom, nom, telephone, zone } = req.body
    if (!prenom || !nom || !telephone) return err(res, 'Prénom, nom et téléphone requis', 400)
    const data = { prenom, nom, telephone }
    if (zone !== undefined) data.zone = zone || null
    const sets = ['prenom=$1','nom=$2','telephone=$3','updated_at=NOW()']
    const pvals = [data.prenom, data.nom, data.telephone]
    if ('zone' in data) { sets.push(`zone=$${pvals.length+1}`); pvals.push(data.zone) }
    pvals.push(req.params.id)
    const uRows = await sql(`UPDATE utilisateurs SET ${sets.join(',')} WHERE id=$${pvals.length} RETURNING id::text as id,prenom,nom,telephone,zone`, ...pvals)
    const user = uRows[0]
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    return ok(res, user)
  } catch(e) { return err(res, e.message, 500) }
})

app.patch('/api/v1/users/:id/status', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try {
    const { statut, motif } = req.body
    const validStatuts = ['actif','suspendu','bloque','en_attente']
    if (!validStatuts.includes(statut)) return err(res, 'Statut invalide', 400)
    // Raw SQL pour éviter erreur 42704 (enum Prisma)
    const rows = await sql(
      `UPDATE utilisateurs SET statut = $1, updated_at = NOW() WHERE id = $2 RETURNING id, prenom, nom, telephone, statut::text as statut`,
      statut, req.params.id
    )
    const user = rows[0]
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // Notification automatique selon le statut
    const notifs = {
      suspendu: {
        titre: '⚠️ Compte suspendu',
        msg: motif || 'Votre compte ManiPay a été suspendu temporairement suite a un probleme de verification. Veuillez contacter le support pour plus d informations.'
      },
      bloque: {
        titre: '🔴 Compte bloqué',
        msg: motif || 'Votre compte ManiPay a été bloqué. Contactez immédiatement le support ManiPay.'
      },
      actif: {
        titre: '✅ Compte réactivé',
        msg: motif || 'Votre compte ManiPay a été réactivé. Vous pouvez maintenant utiliser tous les services.'
      },
      en_attente: {
        titre: '⏳ Compte en attente',
        msg: motif || 'Votre compte est en attente de validation. Vous serez notifié dès la validation.'
      }
    }
    const n = notifs[statut]
    if (n) {
      await notifier(req.params.id, 'securite', n.titre, n.msg, { statut, motif: motif || null, par: req.user.role })
    }
    await logAction(req.user, 'statut_'+statut, user, motif||'')
    return ok(res, user)
  } catch (e) { return err(res, e.message, 500) }
})

// DELETE user — Super Admin uniquement (0505414751)
app.delete('/api/v1/users/:id', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    // Vérifier que c'est le super admin
    if (req.user.telephone !== SUPER_ADMIN_TEL) {
      return err(res, 'Action réservée au Super Administrateur ManiPay', 403)
    }
    const userId = req.params.id
    // Vérifier que l'utilisateur existe
    const delRows = await sql(`SELECT id::text as id, prenom, nom, telephone FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const user = delRows[0] || null
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId]).catch(()=>{})
    await pgPool.query(`DELETE FROM commissions WHERE beneficiaire_id=$1`, [toUUID(userId)]).catch(()=>{})
    const compteDelRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, userId)
    if (compteDelRows[0]) {
      const cid_del = compteDelRows[0].id
      await pgPool.query(`DELETE FROM transactions WHERE compte_source_id=$1 OR compte_dest_id=$1`, [cid_del]).catch(()=>{})
      await pgPool.query(`DELETE FROM comptes WHERE id=$1`, [cid_del]).catch(()=>{})
    }
    await pgPool.query(`DELETE FROM utilisateurs WHERE id=$1`, [userId])
    await logAction(req.user, 'suppression_compte', user, 'Compte supprimé définitivement')
    return ok(res, { message: 'Compte supprimé définitivement' })
  } catch (e) { return err(res, e.message, 500) }
})

// Réinitialiser le PIN d'un utilisateur (Support Client + Admin)
// Niveau 1 — Débloquer simplement : le titulaire connaît déjà son PIN, il a juste été bloqué
// (4 tentatives incorrectes). On lève le blocage SANS toucher au PIN ni au code de récupération.
app.post('/api/v1/users/:id/debloquer', authMiddleware, role('admin', 'backoffice', 'superviseur', 'support_client', 'support_technique'), async (req, res) => {
  try {
    const userId = req.params.id
    const rows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, statut FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const user = rows[0] || null
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    await pgPool.query(`UPDATE utilisateurs SET statut='actif', tentatives_pin_echouees=0 WHERE id=$1`, [userId])
    await pgPool.query(`DELETE FROM otp_lockouts WHERE cle LIKE $1`, [userId + '_%']).catch(()=>{})
    await notifier(userId, 'securite', '🔓 Compte débloqué',
      'Votre compte a été débloqué par le support. Vous pouvez vous reconnecter avec votre PIN habituel.',
      { action: 'debloquer' }
    ).catch(()=>{})
    await logAction(req.user, 'debloquer_compte', user, 'Compte débloqué sans réinitialisation du PIN')
    return ok(res, { success: true, message: 'Compte débloqué. Le titulaire garde son PIN habituel.' })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/users/:id/reset-pin', authMiddleware, role('admin', 'backoffice', 'superviseur', 'support_client', 'support_technique'), async (req, res) => {
  try {
    const userId = req.params.id
    const rpRows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, statut FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const user = rpRows[0] || null
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // ── Vérification des permissions de réinitialisation ──
    const SUPER_ADMIN_TEL = '0505414751'
    const me = req.user
    const isSuperAdmin = (me.role === 'admin' || me.role === 'backoffice') && me.telephone === SUPER_ADMIN_TEL
    const BO_TARGETS  = ['admin','superviseur','master','mini_master','agent','business','client','support_client','support_tech']
    const ADM_TARGETS = ['superviseur','master','mini_master','agent','business','client','support_client','support_tech']
    let allowed = false
    if (isSuperAdmin)          allowed = user.telephone !== SUPER_ADMIN_TEL
    else if (me.role === 'backoffice') allowed = user.telephone !== SUPER_ADMIN_TEL && BO_TARGETS.includes(user.role)
    else if (me.role === 'admin')      allowed = ADM_TARGETS.includes(user.role)
    else                               allowed = true // support_client/tech: accès libre aux clients
    if (!allowed) return err(res, 'Permission refusée', 403)
    // Réinitialiser le PIN à une valeur ALÉATOIRE (jamais 1234, jamais prévisible)
    const pinTemp = genererPinTemporaire()
    const pinHash = await bcrypt.hash(pinTemp, 10)
    await pgPool.query(`UPDATE utilisateurs SET pin_hash=$1, pin_a_changer=TRUE, statut='actif', tentatives_pin_echouees=0, updated_at=NOW() WHERE id=$2`, [pinHash, userId])
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId]).catch(()=>{})
    await notifier(userId, 'securite', '🔐 Code PIN réinitialisé',
      `Votre code PIN a été réinitialisé par le support. Connectez-vous avec le code temporaire communiqué et changez-le immédiatement.`,
      { action: 'reset_pin' }
    )
    await logAction(req.user, 'reset_pin', user, `PIN réinitialisé (code temporaire régénéré)`)
    return ok(res, { pinTemporaire: pinTemp, message: `PIN temporaire à communiquer au titulaire : ${pinTemp}` })
  } catch (e) { return err(res, e.message, 500) }
})

app.get('/api/v1/users/:id/referrals', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'superviseur') {
      const reseau = await getReseauVisibleSuperviseur(req.user.id)
      if (reseau !== null && !reseau.includes(String(req.params.id))) {
        return err(res, 'Ce compte ne fait pas partie de votre réseau', 403)
      }
    }
    const filleuls = await sql(`SELECT id::text as id, prenom, nom, telephone, role, nom_commercial as "nomCommercial", created_at as "createdAt" FROM utilisateurs WHERE parrain_id=$1`, req.params.id)
    // Le back-end renvoie toujours les données complètes ; c'est le front-end qui applique
    // l'affichage adapté (numéro complet pour un filleul client, nom commercial + numéro
    // masqué pour un filleul professionnel), via la fonction contactInfo() partagée.
    const filleulsSafe = filleuls
    const rattRows = await sql(`SELECT COUNT(*) as n FROM rattachements WHERE parrain_id=$1 AND statut='valide'`, req.params.id)
    const nbRattaches = Number(rattRows[0]?.n || 0)
    let totalGains = 0
    if (req.user.statut === 'actif') {
      const gainsRows = await sql(
        `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id = $1`, toUUID(req.params.id)
      )
      totalGains = gainsRows[0]?.total || 0
    }
    return ok(res, { filleuls: filleulsSafe, nbRattaches, totalGains, parrainageActif: req.user.statut === 'actif' })
  } catch (e) { return err(res, e.message, 500) }
})

// Remonte la chaîne des parrains depuis targetId : renvoie true si requesterId est un ancêtre
// (Master/Mini-Master au-dessus, même à plusieurs niveaux — ex. agent rattaché à un Mini-Master
// qui est lui-même rattaché à ce Master).
async function estDansMonReseau(requesterId, targetId) {
  let currentId = targetId
  const MAX_NIVEAUX = 6
  for (let i = 0; i < MAX_NIVEAUX; i++) {
    const row = await pgPool.query(`SELECT parrain_id::text as parrain_id FROM utilisateurs WHERE id::text = $1 LIMIT 1`, [currentId])
    const parrainId = row.rows[0]?.parrain_id
    if (!parrainId) return false
    if (String(parrainId) === String(requesterId)) return true
    currentId = parrainId
  }
  return false
}

// ═══ SUIVI RÉSEAU — stats d'un agent ou business rattaché (pour Master/Mini-Master) ═══
// Sécurité : le parrain direct voit une vue complète ; tout autre Master/Mini-Master dont
// dépend indirectement la cible (via la chaîne de parrainage) a droit à une vue limitée,
// car il perçoit une commission sur cette activité même sans lien direct.
app.get('/api/v1/users/:id/network-stats', authMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id
    const isAdminLike = ['admin','backoffice','superviseur','support_client','support_tech'].includes(req.user.role)
    const targetRows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, parrain_id::text as "parrainId", statut FROM utilisateurs WHERE id=$1 LIMIT 1`, targetId)
    const target = targetRows[0]
    if (!target) return err(res, 'Compte introuvable', 404)
    const requesterId = toUUID(req.user.id)
    const isDirect = String(target.parrainId) === String(requesterId)
    let isInNetwork = isAdminLike || isDirect
    if (!isInNetwork) {
      isInNetwork = await estDansMonReseau(requesterId, targetId)
    }
    if (!isInNetwork) {
      return err(res, 'Accès refusé : ce compte n\'est pas dans votre réseau', 403)
    }
    // Superviseur régional : restreint à son réseau assigné (général = pas de restriction)
    if (req.user.role === 'superviseur') {
      const reseau = await getReseauVisibleSuperviseur(req.user.id)
      if (reseau !== null && !reseau.includes(String(targetId))) {
        return err(res, 'Ce compte ne fait pas partie de votre réseau', 403)
      }
    }
    const compteRows = await sql(`SELECT solde::float as solde FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, targetId)
    const solde = compteRows[0]?.solde || 0
    // isOwner = le requérant est le parrain direct (a créé/enregistré cet agent) ou un rôle admin
    const isOwner = isAdminLike || isDirect

    if (target.role === 'agent') {
      if (isOwner) {
        // Vue complète : agent appartient à ce mini-master
        const aggRows = await pgPool.query(`
          SELECT t.type,
            COUNT(*)::int as nb,
            COALESCE(SUM(t.montant),0)::float as volume,
            c_src.utilisateur_id::text as src_uid,
            c_dst.utilisateur_id::text as dst_uid
          FROM transactions t
          LEFT JOIN comptes c_src ON c_src.id = t.compte_source_id
          LEFT JOIN comptes c_dst ON c_dst.id = t.compte_dest_id
          WHERE (c_src.utilisateur_id = $1 OR c_dst.utilisateur_id = $1)
            AND t.type IN ('depot','retrait','transfert')
          GROUP BY t.type, c_src.utilisateur_id, c_dst.utilisateur_id`, [targetId])
        const stats = { nbDepots:0,volDepots:0,nbRetraits:0,volRetraits:0,nbTrfEnv:0,volTrfEnv:0,nbTrfRec:0,volTrfRec:0 }
        for (const row of aggRows.rows) {
          if (row.type==='depot') { stats.nbDepots+=row.nb; stats.volDepots+=row.volume }
          else if (row.type==='retrait') { stats.nbRetraits+=row.nb; stats.volRetraits+=row.volume }
          else if (row.type==='transfert') {
            if (String(row.src_uid)===String(targetId)) { stats.nbTrfEnv+=row.nb; stats.volTrfEnv+=row.volume }
            else { stats.nbTrfRec+=row.nb; stats.volTrfRec+=row.volume }
          }
        }
        const nbInscriptionsRows = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1 AND role='client'`, targetId)
        return ok(res, {
          isOwner: true, role: 'agent', prenom: target.prenom, nom: target.nom, telephone: target.telephone, statut: target.statut,
          solde, ...stats, nbInscriptions: nbInscriptionsRows[0]?.n || 0
        })
      } else {
        // Vue limitée : agent rattaché mais non-propriétaire
        const nbInscriptionsRows = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1 AND role='client'`, targetId)
        return ok(res, {
          isOwner: false, role: 'agent', prenom: target.prenom, nom: target.nom, telephone: target.telephone, statut: target.statut,
          soldeSuffisant: solde >= 1500000, nbInscriptions: nbInscriptionsRows[0]?.n || 0
        })
      }
    }

    if (target.role === 'business') {
      const payRows = await pgPool.query(`
        SELECT COUNT(*)::int as nb, COALESCE(SUM(t.montant),0)::float as volume
        FROM transactions t
        LEFT JOIN comptes c ON c.id = t.compte_dest_id
        WHERE c.utilisateur_id = $1 AND t.type = 'paiement_marchand'`, [targetId])
      const nbInscriptionsRows = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1`, targetId)
      return ok(res, {
        isOwner, role: 'business', prenom: target.prenom, nom: target.nom, telephone: target.telephone, statut: target.statut,
        nbPaiements: payRows.rows[0]?.nb || 0, volPaiements: payRows.rows[0]?.volume || 0,
        nbInscriptions: nbInscriptionsRows[0]?.n || 0
      })
    }

    if (target.role === 'mini_master') {
      const agentsRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE parrain_id=$1 AND role='agent'`, targetId)
      const agentIds = agentsRows.map(a => a.id)
      const nbBusinessRows = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1 AND role='business'`, targetId)
      const nbClientsDirectsRows = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1 AND role='client'`, targetId)

      if (isOwner) {
        // Vue complète : Mini-Master appartenant à ce Master
        let nbDepots = 0, volDepots = 0, nbRetraits = 0, volRetraits = 0, nbClientsViaAgents = 0
        if (agentIds.length) {
          const aggRows = await pgPool.query(`
            SELECT t.type, COUNT(*)::int as nb, COALESCE(SUM(t.montant),0)::float as volume
            FROM transactions t
            LEFT JOIN comptes c_dst ON c_dst.id = t.compte_dest_id
            LEFT JOIN comptes c_src ON c_src.id = t.compte_source_id
            WHERE (c_dst.utilisateur_id::text = ANY($1) OR c_src.utilisateur_id::text = ANY($1))
              AND t.type IN ('depot','retrait')
            GROUP BY t.type
          `, [agentIds])
          for (const row of aggRows.rows) {
            if (row.type === 'depot') { nbDepots += row.nb; volDepots += row.volume }
            else if (row.type === 'retrait') { nbRetraits += row.nb; volRetraits += row.volume }
          }
          const clientsViaAgentsRows = await pgPool.query(
            `SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id::text = ANY($1) AND role='client'`,
            [agentIds]
          )
          nbClientsViaAgents = clientsViaAgentsRows.rows[0]?.n || 0
        }
        return ok(res, {
          isOwner: true, role: 'mini_master', prenom: target.prenom, nom: target.nom, telephone: target.telephone, statut: target.statut,
          solde,
          nbAgents: agentIds.length,
          nbBusiness: nbBusinessRows[0]?.n || 0,
          nbDepots, volDepots, nbRetraits, volRetraits,
          nbInscriptions: (nbClientsDirectsRows[0]?.n || 0) + nbClientsViaAgents
        })
      } else {
        // Mini-Master rattaché mais non-propriétaire : vue limitée
        return ok(res, {
          isOwner: false, role: 'mini_master', prenom: target.prenom, nom: target.nom, telephone: target.telephone, statut: target.statut,
          nbAgents: agentIds.length,
          nbBusiness: nbBusinessRows[0]?.n || 0,
          soldeSuffisant: solde >= 1500000
        })
      }
    }

    // Client : par confidentialité, aucune info nominative n'est retournée même via cette route
    return ok(res, { role: target.role || 'client' })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ COMPTES ═══
app.get('/api/v1/accounts/me', authMiddleware, async (req, res) => {
  try {
    const toUUID = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const toUUID_acc = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const rows = await sql(
      `SELECT id::text, utilisateur_id::text as "utilisateurId", solde::float, plafond_mensuel::float as "plafondMensuel", type_compte as "typeCompte", created_at as "createdAt"
       FROM comptes WHERE utilisateur_id = $1 LIMIT 1`,
      toUUID_acc(toUUID(req.user.id))
    )
    if (!rows.length) {
      const uid = toUUID(req.user.id)
      if (['backoffice','admin'].includes(req.user.role)) {
        // Créer un compte automatiquement pour les backoffice/admin qui n'en ont pas
        const newId = require('crypto').randomUUID()
        await pgPool.query(
          `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at)
           VALUES ($1, $2::text, 0, 999999999, 'backoffice', NOW())`,
          [newId, uid]
        ).catch(()=>{}) // ignore si déjà existant
        const rows2 = await sql(
          `SELECT id::text, utilisateur_id::text as "utilisateurId", solde::float, plafond_mensuel::float as "plafondMensuel", type_compte as "typeCompte", created_at as "createdAt"
           FROM comptes WHERE utilisateur_id = $1 LIMIT 1`,
          uid
        )
        if (rows2.length) return ok(res, rows2[0])
      }
      return err(res, 'Compte introuvable', 404)
    }
    return ok(res, rows[0])
  }
  catch (e) { return err(res, e.message, 500) }
})

// ═══ TRANSACTIONS ═══
// Lecture : chacun voit ses propres transactions
// Admin/superviseur/support_tech : voient tout
app.get('/api/v1/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit=20, type, statut, userId, q } = req.query
    const canSeeAll = ['admin','backoffice','superviseur','support_client','support_tech'].includes(req.user.role)

    let where = {}
    if (canSeeAll && userId) {
      const cRows1 = await sql(`SELECT id::text FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, userId)
      const c = cRows1[0]
      if (c) where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    } else if (canSeeAll) {
      where = {}
    } else {
      const cRows2 = await sql(`SELECT id::text FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
      const c = cRows2[0]
      if (!c) return ok(res, [])
      where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    }

    if (type) where.type = type
    if (statut) where.statut = statut

    const txConditions = []
    const txParams = []
    let txIdx = 1
    if (where.OR) {
      txConditions.push(`(t.compte_source_id = $${txIdx} OR t.compte_dest_id = $${txIdx+1})`)
      txParams.push(where.OR[0].compteSourceId, where.OR[1].compteDestId)
      txIdx += 2
    }
    if (type) { txConditions.push(`t.type = $${txIdx}`); txParams.push(type); txIdx++ }
    if (statut) { txConditions.push(`t.statut = $${txIdx}`); txParams.push(statut); txIdx++ }

    // Recherche par téléphone, montant ou référence (paramètre q)
    if (q && q.trim()) {
      const qc = q.trim()
      const qNum = qc.replace(/\D/g, '') // chiffres uniquement (pour téléphone/montant)
      txConditions.push(
        `(t.reference ILIKE $${txIdx}` +
        ` OR us.telephone LIKE $${txIdx+1}` +
        ` OR ud.telephone LIKE $${txIdx+1}` +
        ` OR CAST(t.montant AS TEXT) LIKE $${txIdx+2})`
      )
      txParams.push(`%${qc}%`, `%${qNum}%`, `%${qNum}%`)
      txIdx += 3
    }

    const txWhere = txConditions.length > 0 ? 'WHERE ' + txConditions.join(' AND ') : ''
    const txLimit = Math.min(parseInt(limit)||20, 1000)
    const txns = await sql(
      `SELECT t.id::text as id, t.reference, t.type, t.statut,
              t.montant::float as montant, t.frais::float as frais,
              t.description, t.date_creation as date_creation,
              t.compte_source_id::text as compte_source_id,
              t.compte_dest_id::text as compte_dest_id,
              us.prenom as "srcPrenom", us.nom as "srcNom", us.telephone as "srcTel",
              us.nom_commercial as "srcNomCommercial", us.role as "srcRole",
              ud.prenom as "destPrenom", ud.nom as "destNom", ud.telephone as "destTel",
              ud.nom_commercial as "destNomCommercial", ud.role as "destRole"
       FROM transactions t
       LEFT JOIN comptes cs ON cs.id = t.compte_source_id
       LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id
       LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
       LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id
       ${txWhere}
       ORDER BY t.date_creation DESC LIMIT ${txLimit}`,
      ...txParams
    )
    return ok(res, txns)
  } catch (e) { return err(res, e.message, 500) }
})

// ── Recherche d'un CLIENT par téléphone (pour dépôt/retrait) ──
// ── Recherche d'un marchand (Business) par code_parrainage — accessible à tout utilisateur
// authentifié (client, business...), pour afficher le nom du marchand avant paiement.
app.get('/api/v1/business/lookup', authMiddleware, async (req, res) => {
  try {
    const { code } = req.query
    if (!code) return err(res, 'Code marchand requis')
    const rows = await sql(
      `SELECT prenom, nom, telephone FROM utilisateurs WHERE UPPER(REPLACE(REPLACE(code_parrainage,'-',''),' ','')) = $1 AND role='business' LIMIT 1`,
      normCode(code)
    )
    if (!rows.length) return err(res, 'Marchand introuvable', 404)
    return ok(res, rows[0])
  } catch (e) { return err(res, e.message, 500) }
})

app.get('/api/v1/users/lookup-client', authMiddleware, role(...OPERATIONS, 'business'), async (req, res) => {
  try {
    const { telephone } = req.query
    if (!telephone) return err(res, 'Numéro requis')
    const tel = telephone.replace(/\s+/g, '').replace(/^00225/, '0').replace(/^\+225/, '0')
    const rows = await sql(`
      SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut,
             u.kyc_niveau as "kycNiveau",
             json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
      FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id
      WHERE u.telephone=$1 GROUP BY u.id LIMIT 1
    `, tel)
    if (!rows.length) return err(res, 'Client introuvable', 404)
    const u = rows[0]
    if (u.statut === 'bloque') return err(res, 'Ce compte est bloqué')
    if (!u.comptes) u.comptes = []
    return ok(res, u)
  } catch(e) { return err(res, e.message, 500) }
})

// ── Recherche d'un compte professionnel par téléphone (pour transferts de liquidité) ──
// Accessible par tous les opérateurs (agents, mini-masters, masters)
// Ne retourne que les professionnels (pas les clients), pour la confidentialité
app.get('/api/v1/users/lookup-pro', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone } = req.query
    if (!telephone) return err(res, 'Numéro requis')
    const rows = await sql(`
      SELECT id::text as id, prenom, nom, telephone, role, statut, zone
      FROM utilisateurs
      WHERE telephone = $1
        AND role IN ('agent','mini_master','master','business','superviseur','admin','backoffice')
      LIMIT 1
    `, telephone.replace(/\s+/g, '').replace(/^00225/, '0').replace(/^\+225/, '0'))
    if (!rows.length) return err(res, 'Aucun professionnel trouvé avec ce numéro', 404)
    if (rows[0].statut === 'bloque') return err(res, 'Ce compte est bloqué')
    return ok(res, rows[0])
  } catch(e) { return err(res, e.message, 500) }
})


app.get('/api/v1/users/:id/transactions', authMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id
    const { limit = 500, type } = req.query
    const lim = Math.min(parseInt(limit)||500, 2000)
    const isAdminLike = ['admin','backoffice','superviseur','support_client','support_tech'].includes(req.user.role)

    // Vérifier que le demandeur est le parrain direct OU un rôle admin
    if (!isAdminLike) {
      const targetRows = await sql(`SELECT parrain_id::text as "parrainId" FROM utilisateurs WHERE id=$1 LIMIT 1`, targetId)
      if (!targetRows[0] || String(targetRows[0].parrainId) !== String(toUUID(req.user.id))) {
        return err(res, 'Accès refusé', 403)
      }
    }
    // Superviseur régional : restreint à son réseau assigné (général = pas de restriction)
    if (req.user.role === 'superviseur') {
      const reseau = await getReseauVisibleSuperviseur(req.user.id)
      if (reseau !== null && !reseau.includes(String(targetId))) {
        return err(res, 'Ce compte ne fait pas partie de votre réseau', 403)
      }
    }

    const cRows = await sql(`SELECT id::text FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, targetId)
    if (!cRows[0]) return ok(res, [])
    const cid = cRows[0].id

    const params = [cid, cid]
    let typeWhere = ''
    if (type) { typeWhere = ` AND t.type = $3`; params.push(type) }

    const txns = await sql(`
      SELECT t.id::text as id, t.reference, t.type, t.statut,
             t.montant::float as montant, t.frais::float as frais,
             t.compte_source_id::text as "compteSourceId",
             t.compte_dest_id::text as "compteDestId",
             t.date_creation as "dateCreation"
      FROM transactions t
      WHERE (t.compte_source_id = $1 OR t.compte_dest_id = $2)${typeWhere}
      ORDER BY t.date_creation DESC LIMIT ${lim}`, ...params)
    return ok(res, txns)
  } catch (e) { return err(res, e.message, 500) }
})

// Preview dépôt
app.get('/api/v1/transactions/preview/deposit', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const pdRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.statut, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = pdRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes) client.comptes = []
    const gainOp = 0 // Plus de commission dépôt pour l'agent (remplacé par commission journalière)
    return ok(res, {...client, frais:0, gainAgent:gainOp, gainPlatform:0 })
  } catch (e) { return err(res, e.message, 500) }
})

// Preview retrait
app.get('/api/v1/transactions/preview/withdraw', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const pwRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.statut, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = pwRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes) client.comptes = []
    const amt=Number(montant); const taux=TAUX_RETRAIT // 1% fixe, quel que soit le montant (aligné sur l'exécution réelle du retrait)
    const frais=Math.round(amt*taux); const gainAgent=0; const gainPlatform=frais
    const solde=client.comptes?.[0]?.solde||0
    return ok(res, {...client, frais, gainAgent, taux, soldeInsuffisant: solde<(amt+frais) })
  } catch (e) { return err(res, e.message, 500) }
})

// Dépôt — agents, MM, Master, admin
app.post('/api/v1/transactions/deposit', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null
    if (!agentC||agentC.solde<amt) return err(res, 'Liquidité insuffisante')
    const depClientRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.parrain_id::text as "parrainId", json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = depClientRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes?.length) return err(res, 'Compte client introuvable', 404)
    // Bloquer les dépôts entre professionnels — seuls les clients peuvent recevoir un dépôt
    const ROLES_PRO = ['agent','mini_master','master','superviseur','admin','backoffice','support_client','support_tech']
    if (ROLES_PRO.includes(client.role)) {
      return err(res, 'Les dépôts ne sont autorisés que vers des comptes clients. Pour transférer de la liquidité à un agent ou mini-master, utilisez le Transfert.')
    }
    const clientC = client.comptes[0]
    // Pas de plafond sur les dépôts — plafonds KYC = gains de parrainage uniquement
    // Plus de commission dépôt pour l'agent — remplacée par commission journalière
    const ref='DEP-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'depot','complete',$3,$4,$5,0,$6,NOW())`,
      [txId, ref, agentC.id, clientC.id, amt, toUUID(req.user.id)]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text = $2`, [amt, agentC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text = $2`, [amt, clientC.id])
    // Notification dépôt au client
    await notifier(client.id, 'transaction', '💰 Dépôt reçu',
      `Votre compte a été crédité de ${amt.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, reference:ref, type:'depot' }
    )
    // Notification à l'agent (sans mention commission)
    await notifier(toUUID(req.user.id), 'transaction', '✅ Dépôt effectué',
      `Dépôt de ${amt.toLocaleString('fr-FR')} F CFA pour ${client.prenom||''} ${client.nom||''}.`,
      { montant:amt, reference:ref, type:'depot_agent' }
    ).catch(()=>{})
    // Rattachement : entrée d'argent
    verifierRattachement(client.id, 'depot', amt).catch(() => {})
    // Récupérer nouveau solde client pour mise à jour immédiate côté client
    const newClientSolde = await sql(`SELECT solde::float as solde FROM comptes WHERE id::text=$1`, clientC.id).then(r=>r[0]?.solde||0).catch(()=>null)
    majCommissionJourAgent(String(toUUID(req.user.id))).catch(()=>{})
    return ok(res, {id:txId, reference:ref, type:'depot', montant:amt, gainAgent:0, clientId:client.id, clientSolde:newClientSolde})
  } catch (e) { return err(res, e.message, 500) }
})

// Retrait — agents, MM, Master, admin
// ══ RETRAIT AVEC AUTORISATION CLIENT (OTP) ══
// OTP stocké en DB table otp_retraits

// ÉTAPE 1 : Agent demande autorisation → génère OTP → notifie client
// ── Demande OTP en attente pour MOI (retrait ou encaissement) — pour afficher un vrai bouton
// "Refuser" côté client, plutôt que de devoir simplement ignorer la notification. ──
app.get('/api/v1/transactions/otp/pending', authMiddleware, async (req, res) => {
  try {
    const userId = toUUID(req.user.id)
    const retraitRows = await sql(
      `SELECT r.*, u.prenom, u.nom FROM otp_retraits r JOIN utilisateurs u ON u.id::text=r.agent_id WHERE r.client_id=$1 AND r.expires_at > NOW() LIMIT 1`,
      userId
    )
    if (retraitRows.length) {
      const r = retraitRows[0]
      return ok(res, { pending: true, type: 'retrait', montant: Number(r.amt), demandeurNom: `${r.prenom||''} ${r.nom||''}`.trim(), otp: r.otp, expiresAt: r.expires_at })
    }
    const encRows = await sql(
      `SELECT e.*, u.prenom, u.nom FROM otp_encaissements e JOIN utilisateurs u ON u.id::text=e.business_id WHERE e.client_id=$1 AND e.expires_at > NOW() LIMIT 1`,
      userId
    )
    if (encRows.length) {
      const e = encRows[0]
      return ok(res, { pending: true, type: 'encaissement', montant: Number(e.amt), demandeurNom: `${e.prenom||''} ${e.nom||''}`.trim(), otp: e.otp, expiresAt: e.expires_at })
    }
    return ok(res, { pending: false })
  } catch (e) { return err(res, e.message, 500) }
})

// Refuse la demande en cours — invalide le code immédiatement, plutôt que de simplement
// l'ignorer. Garde une trace claire (alerte) en cas de litige ultérieur.
app.post('/api/v1/transactions/otp/refuser', authMiddleware, async (req, res) => {
  try {
    const userId = toUUID(req.user.id)
    const retraitRows = await sql(`SELECT * FROM otp_retraits WHERE client_id=$1 AND expires_at > NOW() LIMIT 1`, userId)
    if (retraitRows.length) {
      const r = retraitRows[0]
      await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`, [r.cle])
      await pgPool.query(
        `INSERT INTO alertes (id, titre, description, gravite, service, statut, auteur, auteur_role, created_at, updated_at)
         VALUES (gen_random_uuid()::text, 'Retrait refusé par le client', $1, 'basse', 'admin', 'ouverte', 'systeme', 'systeme', NOW(), NOW())`,
        [`Le client ${r.client_nom||userId} a refusé une demande de retrait de ${r.amt} initiée par l'agent ${r.agent_id}.`]
      ).catch(()=>{})
      await notifier(r.agent_id, 'transaction', '❌ Retrait refusé', `Le client a refusé la demande de retrait de ${Number(r.amt).toLocaleString('fr-FR')}.`, { type: 'retrait_refuse' }).catch(()=>{})
      return ok(res, { success: true, type: 'retrait' })
    }
    const encRows = await sql(`SELECT * FROM otp_encaissements WHERE client_id=$1 AND expires_at > NOW() LIMIT 1`, userId)
    if (encRows.length) {
      const e = encRows[0]
      await pgPool.query(`DELETE FROM otp_encaissements WHERE cle=$1`, [e.cle])
      await pgPool.query(
        `INSERT INTO alertes (id, titre, description, gravite, service, statut, auteur, auteur_role, created_at, updated_at)
         VALUES (gen_random_uuid()::text, 'Encaissement refusé par le client', $1, 'basse', 'admin', 'ouverte', 'systeme', 'systeme', NOW(), NOW())`,
        [`Le client ${e.client_nom||userId} a refusé une demande d'encaissement de ${e.amt} initiée par le business ${e.business_id}.`]
      ).catch(()=>{})
      await notifier(e.business_id, 'transaction', '❌ Encaissement refusé', `Le client a refusé l'encaissement de ${Number(e.amt).toLocaleString('fr-FR')}.`, { type: 'encaissement_refuse' }).catch(()=>{})
      return ok(res, { success: true, type: 'encaissement' })
    }
    return err(res, 'Aucune demande en attente', 404)
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/transactions/withdraw/request', authMiddleware, role(...OPERATIONS), async (req, res) => {

  try {
    const { telephone, montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')

    const cleBlocage = telephone + '_' + toUUID(req.user.id)
    const blocageRestant = await verifierBlocageOTP(cleBlocage)
    if (blocageRestant) return err(res, `Trop de tentatives incorrectes avec ce client. Réessayez dans ${blocageRestant}h.`, 429)

    const clientRows = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut::text as statut,
              u.kyc_niveau::text as "kycNiveau",
              c.id as compte_id, c.solde::float as solde
       FROM utilisateurs u
       LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 LIMIT 1`, telephone)
    if (!clientRows.length) return err(res, 'Client introuvable', 404)
    const clientRow = clientRows[0]
    const toUUID2 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const client = { ...clientRow, id: toUUID2(clientRow.id) }
    const clientC = { id: toUUID2(clientRow.compte_id), solde: Number(clientRow.solde||0) }

    if (!['client','business'].includes(client.role)) return err(res, 'Ce compte ne peut pas faire de retrait')
    if (!['actif','en_attente'].includes(client.statut)) return err(res, 'Compte client suspendu ou bloqué')

    const taux = TAUX_RETRAIT
    const frais = Math.round(amt*taux)
    const total = amt + frais
    if (clientC.solde < total) return err(res, `Solde insuffisant`)

    // Générer OTP 4 chiffres
    const otp = String(Math.floor(1000 + Math.random() * 9000))
    const agentId = toUUID(req.user.id)
    const key = telephone + '_' + agentId
    await pgPool.query(
      `INSERT INTO otp_retraits (cle,otp,amt,frais,total,taux,client_id,client_compte_id,client_nom,agent_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()+INTERVAL '3 minutes')
       ON CONFLICT (cle) DO UPDATE SET otp=EXCLUDED.otp,amt=EXCLUDED.amt,frais=EXCLUDED.frais,
       total=EXCLUDED.total,taux=EXCLUDED.taux,client_id=EXCLUDED.client_id,
       client_compte_id=EXCLUDED.client_compte_id,client_nom=EXCLUDED.client_nom,
       agent_id=EXCLUDED.agent_id,expires_at=EXCLUDED.expires_at,tentatives=0`,
      [key,otp,amt,frais,total,taux,client.id,clientC.id,
       (client.prenom||'')+' '+(client.nom||''),agentId]
    )

    // Notifier le client — le code OTP n'est plus inclus en clair dans le texte de la
    // notification push (qui peut s'afficher sur l'écran verrouillé) : il n'est visible que dans
    // l'app elle-même (bandeau d'accueil + liste des notifications, une fois déverrouillée).
    const agentRows = await sql(
      `SELECT prenom, nom, telephone FROM utilisateurs WHERE id=$1 LIMIT 1`, agentId
    ).catch(()=>[])
    const agentNom = agentRows[0] ? (agentRows[0].prenom||'') + ' ' + (agentRows[0].nom||'') : 'Un agent'

    await notifier(client.id, 'transaction', '🔐 Autorisation retrait requise',
      `${agentNom} demande à retirer ${amt.toLocaleString('fr-FR')} F CFA de votre compte. Ouvrez ManiPay pour voir le code à lui communiquer (valable 3 min).`,
      { otp, montant: amt, frais, total, agentNom, type: 'retrait_otp' }
    )

    return ok(res, {
      clientNom: client.prenom + ' ' + client.nom,
      montant: amt, frais, total, taux,
      expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      message: 'Code OTP envoyé au client. Demandez-lui le code.'
    })
  } catch(e) { return err(res, e.message, 500) }
})

// ÉTAPE 2 : Agent saisit l'OTP → retrait exécuté
app.post('/api/v1/transactions/withdraw/confirm', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, otp } = req.body
    const agentId = toUUID(req.user.id)
    const key = telephone + '_' + agentId
    const otpRows = await pgPool.query(`SELECT * FROM otp_retraits WHERE cle=$1`,[key])
    const otpRow = (Array.isArray(otpRows) ? otpRows : (otpRows.rows||[]))[0] || null

    if (!otpRow) return err(res, 'Aucune demande en attente pour ce client', 400)
    if (new Date() > new Date(otpRow.expires_at)) {
      await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`,[key])
      return err(res, 'Code OTP expiré (3 min). Recommencez.', 400)
    }
    if (String(otp).trim() !== String(otpRow.otp)) {
      const tentatives = Number(otpRow.tentatives || 0) + 1
      if (tentatives >= 3) {
        await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`, [key])
        const offenses = await poserBlocageOTP(key, agentId, otpRow.client_nom, 'retrait')
        if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support pour réactivation.", 403)
        return err(res, 'Trop de tentatives incorrectes. Nouvelle demande possible dans 24h.', 429)
      }
      await pgPool.query(`UPDATE otp_retraits SET tentatives=$1 WHERE cle=$2`, [tentatives, key])
      return err(res, `Code OTP incorrect (${tentatives}/3 tentatives)`, 400)
    }
    await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`,[key])
    const amt=Number(otpRow.amt), frais=Number(otpRow.frais), total=Number(otpRow.total), taux=Number(otpRow.taux)
    const clientId=otpRow.client_id, clientCompteId=otpRow.client_compte_id, clientNom=otpRow.client_nom

    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, agentId)
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null

    const ref = 'RET-' + Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const gainAgent = 0 // Plus de 35% — remplacé par commission journalière

    // Débiter client (total = montant + frais) et créditer agent du montant (le cash physique reçu)
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text=$2`, [total, clientCompteId])
    if (agentC) await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text=$2`, [amt, agentC.id])

    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      [txId, ref, clientCompteId, agentC?.id||clientCompteId, amt, frais, agentId]
    )

    // Commission agent
    if (gainAgent > 0) {
      await pgPool.query(
        `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
         VALUES ($1,$2,'retrait_agent',$3,$4,'verse',NOW())`,
        [require('crypto').randomUUID(), agentId, gainAgent, taux]
      ).catch(()=>{})
    }

    // Gain parrainage : taux selon le rôle du parrain (agent/master/mini_master 10%, client/business 5%, plafonné)
    let gainParrainOTP = 0
    try {
      const filleulRatt = await sql(
        `SELECT r.parrain_id, u.role as parrain_role FROM rattachements r
         JOIN utilisateurs u ON u.id::text = r.parrain_id::text
         WHERE r.filleul_id=$1 AND r.statut='valide' LIMIT 1`, clientId
      )
      if (filleulRatt[0]?.parrain_id) {
        const parrainId = filleulRatt[0].parrain_id
        const { gain, taux } = await calculerGainParrainPlafonne(parrainId, filleulRatt[0].parrain_role, frais)
        gainParrainOTP = gain
        const _superAdId = await getSuperAdminId()
        if (gainParrainOTP > 0 && String(parrainId) !== String(_superAdId)) {
          await pgPool.query(
            `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,montant_original,taux,statut,date_calcul)
             VALUES ($1,$2,'parrainage',$3,$3,$4,'en_attente',NOW())`,
            [require('crypto').randomUUID(), parrainId, gainParrainOTP, taux]
          )
          await notifier(parrainId,'gains','🤝 Gain parrainage',
            `+${gainParrainOTP.toLocaleString('fr-FR')} sur le retrait de votre filleul.`,
            {montant:gainParrainOTP,type:'parrainage'}
          ).catch(()=>{})
        }
      }
    } catch(ep){console.warn('[PARRAINAGE]',ep.message)}

    // Notifications
    await notifier(clientId, 'transaction', '💸 Retrait autorisé et effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès. Réf: ${ref}`,
      { montant:amt, frais, total, reference:ref, type:'retrait' }
    )
    await notifier(agentId, 'transaction', '✅ Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA pour ${clientNom}. Commission : +${gainAgent.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, gainAgent, reference:ref, type:'retrait_agent' }
    ).catch(()=>{})

    // Nouveau solde client
    const newSoldeR = await sql(`SELECT solde::float as solde FROM comptes WHERE id::text=$1`, clientCompteId).then(r=>r[0]?.solde||0).catch(()=>null)

    // Commission réseau : Mini-Master/Master reçoit 3% ou 5% des frais de retrait
    const reseauRetrait1 = await crediterReseauHierarchie(agentId, clientId, frais, 'retrait').catch(()=>0)
    // Gain ManiPay = frais - agent - parrain - réseau
    const gainManiRetrait1 = Math.max(0, frais - gainAgent - gainParrainOTP - reseauRetrait1)
    creditManiPay(gainManiRetrait1, 'retrait', ref).catch(()=>{})

    majCommissionJourAgent(agentId).catch(()=>{})
    return ok(res, { id:txId, reference:ref, type:'retrait', montant:amt, frais, total, gainAgent, clientSolde:newSoldeR })
  } catch(e) { return err(res, e.message, 500) }
})

app.post('/api/v1/transactions/withdraw', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    // Raw SQL pour éviter l'enum statut/kyc_niveau
    const clientRows = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut::text as statut,
              u.kyc_niveau::text as "kycNiveau", u.parrain_id as "parrainId",
              c.id as compte_id, c.solde::float as solde
       FROM utilisateurs u
       LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 LIMIT 1`, telephone)
    if (!clientRows.length) return err(res, 'Client introuvable', 404)
    const clientRow = clientRows[0]
    const toUUID2 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const client = { ...clientRow, id: toUUID2(clientRow.id), parrainId: toUUID2(clientRow.parrainId) }
    const clientC = { id: toUUID2(clientRow.compte_id), solde: Number(clientRow.solde||0) }
    if (!clientC.id) return err(res, 'Compte client introuvable', 404)
    if (['client','business'].includes(client.role)) {
      if (!['actif','en_attente'].includes(client.statut)) return err(res, 'Compte client suspendu ou bloqué')
    }
    const taux=TAUX_RETRAIT
    const frais=Math.round(amt*taux); const gainAgent=0; const total=amt+frais
    if (clientC.solde<total) return err(res, 'Solde client insuffisant')
    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null
    const ref='RET-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      [txId, ref, clientC.id, agentC.id, amt, frais, toUUID(req.user.id)]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text = $2`, [total, clientC.id])
    if (agentC) await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text = $2`, [amt, agentC.id])
    // Plus de commission retrait_agent (35% supprimé) — commission journalière remplace
    // Notification retrait au client
    await notifier(client.id, 'transaction', '💸 Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès.`,
      { montant:amt, reference:ref, type:'retrait' }
    )
    // Notification commission à l'agent
    await notifier(toUUID(req.user.id), 'transaction', '✅ Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA pour ${client.prenom||''} ${client.nom||''}. Commission : +${gainAgent.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, gainAgent, reference:ref, type:'retrait_agent' }
    ).catch(()=>{})
    // Commission parrain : taux selon le rôle du parrain (agent/master/mini_master 10%, client/business 5%, plafonné)
    let gainParrainW = 0
    if (client.parrainId) {
      try {
        const rattRows = await sql(
          `SELECT r.id, u.role as parrain_role FROM rattachements r
           JOIN utilisateurs u ON u.id::text = r.parrain_id::text
           WHERE r.filleul_id = $1 AND r.statut = 'valide'`, client.id
        )
        if (rattRows && rattRows.length) {
          const { gain, taux } = await calculerGainParrainPlafonne(client.parrainId, rattRows[0].parrain_role, frais)
          gainParrainW = gain
          const _saId2 = await getSuperAdminId()
          if (gainParrainW >= 1 && String(client.parrainId) !== String(_saId2)) {
            await pgPool.query(
              `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,montant_original,taux,statut,date_calcul)
               VALUES ($1,$2,'parrainage',$3,$3,$4,'en_attente',NOW())`,
              [require('crypto').randomUUID(), client.parrainId, gainParrainW, taux]
            )
            console.log('[PARRAIN] +' + gainParrainW + ' FCFA → parrain:', client.parrainId)
          }
        }
      } catch(ep) { console.warn('[PARRAIN]', ep.message) }
    }
    // Récupérer nouveau solde client pour mise à jour immédiate
    const newClientSoldeR = await sql(`SELECT solde::float as solde FROM comptes WHERE id::text=$1`, clientC.id).then(r=>r[0]?.solde||0).catch(()=>null)
    // Commission réseau : Mini-Master/Master reçoit 3% ou 5% des frais de retrait
    const reseauRetrait2 = await crediterReseauHierarchie(toUUID(req.user.id), client.id, frais, 'retrait').catch(()=>0)
    // Gain ManiPay = frais - agent - parrain - réseau
    const gainManiRetrait2 = Math.max(0, frais - gainAgent - gainParrainW - reseauRetrait2)
    creditManiPay(gainManiRetrait2, 'retrait', ref).catch(()=>{})
    majCommissionJourAgent(String(toUUID(req.user.id))).catch(()=>{})
    return ok(res, {id:txId, reference:ref, type:'retrait', montant:amt, frais, total, gainAgent, clientId:client.id, clientSolde:newClientSoldeR})
  } catch (e) { return err(res, e.message, 500) }
})

// Transfert — tous
app.post('/api/v1/transactions/transfer', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant, motif } = req.body; const amt=Number(montant)
    if (!amt||amt<=0) return err(res,'Montant invalide')
    // Compte source
    const srcRows = await sql(
      `SELECT c.id, c.solde, u.id as uid FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id WHERE u.id=$1 LIMIT 1`,
      toUUID(req.user.id)
    )
    if (!srcRows.length) return err(res,'Compte source introuvable',404)
    const srcC = srcRows[0]
    if (Number(srcC.solde)<amt) return err(res,'Solde insuffisant')
    // Recherche flexible : avec ou sans indicatif +225
    const telClean = telephone.replace(/^\+225/, '').replace(/\s/g,'')
    const dstRows = await sql(
      `SELECT c.id as cid, u.id as uid, u.prenom, u.nom, u.telephone, u.parrain_id as "parrainId"
       FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id
       WHERE u.telephone=$1 OR u.telephone=$2 OR u.telephone=$3 LIMIT 1`,
      telephone, telClean, '+225'+telClean
    )
    // Règles de transfert :
    // - client → client uniquement
    // - business → business uniquement
    // - réseau (agent/mini_master/master/superviseur/backoffice) → réseau uniquement
    // - admin/backoffice : aucune restriction (opérations de gestion)
    const PROS = ['agent','mini_master','master','superviseur','backoffice','super_backoffice']
    const srcRole = req.user.role || 'client'
    const isSrcClient = srcRole === 'client'
    const isSrcBusiness = srcRole === 'business'
    const isSrcPro = PROS.includes(srcRole)

    if (dstRows.length) {
      const dstRoleRows = await sql(
        `SELECT role FROM utilisateurs WHERE id = $1 LIMIT 1`, dstRows[0].uid
      )
      const dstRole = dstRoleRows[0]?.role || 'client'
      const isDstClient = dstRole === 'client'
      const isDstBusiness = dstRole === 'business'
      const isDstPro = PROS.includes(dstRole)
      const isBackofficeOrAdmin = ['admin','backoffice'].includes(srcRole)

      if (!isBackofficeOrAdmin) {
        // Client ne peut transférer qu'à un autre client
        if (isSrcClient && !isDstClient) {
          return err(res, "Un client ne peut transférer qu'à un autre client.", 400)
        }
        // Business ne peut transférer qu'à un autre Business
        if (isSrcBusiness && !isDstBusiness) {
          return err(res, "Un compte Business ne peut transférer qu'à un autre compte Business.", 400)
        }
        // Réseau (agent/mini-master/master) ne peut transférer qu'à un autre compte du réseau
        if (isSrcPro && !isDstPro) {
          return err(res, "Les transferts du réseau ne sont autorisés qu'entre comptes du réseau (Agent, Mini-Master, Master).", 400)
        }
      }
    }
    if (!dstRows.length) {
      // Vérifier si l'utilisateur existe sans compte
      const userRows = await sql(
        `SELECT id, prenom, nom, telephone FROM utilisateurs WHERE telephone=$1 OR telephone=$2 OR telephone=$3 LIMIT 1`,
        telephone, telClean, '+225'+telClean
      )
      if (!userRows.length) return err(res,'Destinataire introuvable',404)
      // Créer le compte manquant
      const newCid = require('crypto').randomUUID()
      await pgPool.query(
        `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
         VALUES ($1, $2, 0, 20000, 'client', NOW(), NOW())`,
        [newCid, userRows[0].id]
      )
      // Relancer la recherche
      const dstRows2 = await sql(
        `SELECT c.id as cid, u.id as uid, u.prenom, u.nom, u.telephone, u.parrain_id as "parrainId"
         FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id
         WHERE u.id=$1 LIMIT 1`, userRows[0].id
      )
      if (!dstRows2.length) return err(res,'Erreur création compte destinataire',500)
      dstRows.push(dstRows2[0])
    }
    const dstC = dstRows[0]

    // ── Franchise Business → Business ──
    // 20 000 FCFA/jour gratuits en émission ET 20 000 FCFA/jour gratuits en réception,
    // de façon INDÉPENDANTE : chaque camp a son propre quota. Au-delà de son propre quota,
    // ce camp (et seulement ce camp) paie 0,5% — il est donc possible que l'émetteur paie
    // sans que le destinataire paie, et inversement.
    let fraisSrc = 0, fraisDst = 0
    if (isSrcBusiness && dstRows.length && dstRows[0].uid) {
      const dstRoleCheck = await sql(`SELECT role FROM utilisateurs WHERE id = $1 LIMIT 1`, dstC.uid)
      if (dstRoleCheck[0]?.role === 'business') {
        const sentTodayRows = await sql(
          `SELECT COALESCE(SUM(montant),0)::float as total FROM transactions
           WHERE type='transfert' AND statut='complete' AND compte_source_id=$1
           AND date_creation::date = CURRENT_DATE`, srcC.id
        )
        const receivedTodayRows = await sql(
          `SELECT COALESCE(SUM(montant),0)::float as total FROM transactions
           WHERE type='transfert' AND statut='complete' AND compte_dest_id=$1
           AND date_creation::date = CURRENT_DATE`, dstC.cid
        )
        const sentToday = sentTodayRows[0]?.total || 0
        const receivedToday = receivedTodayRows[0]?.total || 0
        if (sentToday + amt > 20000) fraisSrc = Math.round(amt * TAUX_PAIEMENT_CLIENT)
        if (receivedToday + amt > 20000) fraisDst = Math.round(amt * TAUX_PAIEMENT_BUSINESS)
      }
    }
    const fraisTotalTransfert = fraisSrc + fraisDst
    if (Number(srcC.solde) < amt + fraisSrc) return err(res, 'Solde insuffisant pour couvrir le montant et les frais')

    const ref='TRF-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,date_creation)
       VALUES ($1,$2,'transfert','complete',$3,$4,$5,$6,NOW())`,
      [txId, ref, srcC.id, dstC.cid, amt, fraisTotalTransfert]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text = $2`, [amt+fraisSrc, srcC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text = $2`, [amt-fraisDst, dstC.cid])
    verifierRattachement(dstC.uid, 'transfert_recu', amt).catch(()=>{})
    await notifier(toUUID(req.user.id),'transaction','📤 Transfert envoyé',
      `Vous avez envoyé ${amt.toLocaleString('fr-FR')} F CFA.`,{montant:amt,reference:ref,type:'transfert_envoye'})
    await notifier(dstC.uid,'transaction','📥 Argent reçu',
      `Vous avez reçu ${amt.toLocaleString('fr-FR')} F CFA.`,{montant:amt,reference:ref,type:'transfert_recu'})
    return ok(res,{id:txId,reference:ref,type:'transfert',montant:amt})
  } catch (e) { return err(res, e.message, 500) }
})

// Paiement marchand
app.post('/api/v1/transactions/pay', authMiddleware, async (req, res) => {
  try {
    const { merchantCode, montant } = req.body; const amt=Number(montant)
    if (!amt || amt <= 0) return err(res, 'Montant invalide')
    const { fraisTotal: frais, fraisClient, fraisBusiness } = splitFraisPaiement(amt)
    const totalDebitClient = amt + fraisClient
    const srcRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const srcC = srcRows[0] ? { id: srcRows[0].id, solde: srcRows[0].solde } : null
    if (!srcC||srcC.solde<totalDebitClient) return err(res, 'Solde insuffisant')
    const merchantRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE UPPER(REPLACE(REPLACE(u.code_parrainage,'-',''),' ','')) = $1 AND u.role='business' GROUP BY u.id LIMIT 1`, normCode(merchantCode)
    )
    const merchant = merchantRows[0] || null
    if (!merchant) return err(res, 'Marchand introuvable', 404)
    if (!merchant.comptes?.length) return err(res, 'Compte marchand introuvable', 404)
    const mC=merchant.comptes[0]; const ref='PAY-'+Date.now().toString(36).toUpperCase()
    const payTxId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,date_creation) VALUES ($1,$2,'paiement_marchand','complete',$3,$4,$5,$6,NOW())`,
      [payTxId, ref, srcC.id, mC.id, amt, frais])
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text=$2`, [totalDebitClient, srcC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text=$2`, [amt-fraisBusiness, mC.id])
    verifierRattachement(merchant.id, 'paiement_marchand_recu', amt-fraisBusiness).catch(() => {})
    const tx = { id: payTxId, reference: ref, montant: amt, frais, fraisClient, fraisBusiness, totalDebitClient, type: 'paiement_marchand' }
    // Commission parrain : taux selon le rôle du parrain (agent/master/mini_master 10%, client/business 5%, plafonné)
    let gainParrainPay = 0
    try {
      const rattRows = await sql(
        `SELECT r.id, r.parrain_id, u.role as parrain_role FROM rattachements r
         JOIN utilisateurs u ON u.id::text = r.parrain_id::text
         WHERE r.filleul_id = $1 AND r.statut = 'valide'`,
        toUUID(req.user.id)
      )
      if (rattRows && rattRows.length && rattRows[0].parrain_id) {
        const parrainId = rattRows[0].parrain_id
        const { gain, taux } = await calculerGainParrainPlafonne(parrainId, rattRows[0].parrain_role, frais)
        gainParrainPay = gain
        const _saId3 = await getSuperAdminId()
        if (gainParrainPay >= 1 && String(parrainId) !== String(_saId3)) {
          await pgPool.query(
            `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,montant_original,taux,statut,date_calcul)
             VALUES ($1,$2,'parrainage',$3,$3,$4,'en_attente',NOW())`,
            [require('crypto').randomUUID(), parrainId, gainParrainPay, taux]
          )
          console.log('[PARRAIN PAY] +' + gainParrainPay + ' FCFA → parrain:', parrainId)
        }
      }
    } catch(ep) { console.warn('[PARRAIN PAY]', ep.message) }
    // Notif client payeur
    await notifier(toUUID(req.user.id), 'transaction', '🛒 Paiement effectué',
      `Paiement de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès (+ ${fraisClient.toLocaleString('fr-FR')} F de frais).`,
      { montant:amt, frais:fraisClient, reference:ref, type:'paiement_envoye' }
    )
    // Notif marchand
    await notifier(merchant.id, 'transaction', '💳 Paiement reçu',
      `Vous avez reçu un paiement de ${amt.toLocaleString('fr-FR')} F CFA (frais: ${fraisBusiness.toLocaleString('fr-FR')} F).`,
      { montant:amt, frais:fraisBusiness, reference:ref, type:'paiement_recu' }
    )
    // Commission réseau sur paiement marchand : Mini-Master/Master DU MARCHAND (pas du payeur) reçoit 10%/20% des frais
    const reseauDistribue = await crediterReseauHierarchie(null, merchant.id, frais, 'paiement_marchand').catch(()=>0)
    // Gain ManiPay = frais - parrain - réseau
    const gainManiPay = Math.max(0, frais - gainParrainPay - reseauDistribue)
    creditManiPay(gainManiPay, 'paiement_marchand', ref).catch(()=>{})
    return ok(res, tx)
  } catch (e) { return err(res, e.message, 500) }
})

// Encaisser un client — initié par le BUSINESS (scan du QR personnel du client + montant).
// Débite directement le client et crédite le business, avec le même partage de frais 0.5%/0.5%
// que /transactions/pay. Le business doit être authentifié ; le client est identifié par téléphone.
// ══ ENCAISSEMENT CLIENT AVEC AUTORISATION (OTP) — même mécanisme que le retrait agent ══
// ÉTAPE 1 : Business demande l'encaissement → génère OTP → notifie le client
app.post('/api/v1/transactions/collect/request', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'business') return err(res, 'Réservé aux comptes Business', 403)
    const { telephone, montant } = req.body
    const amt = Number(montant)
    if (!telephone || !amt || amt <= 0) return err(res, 'Téléphone et montant requis')
    const cleBlocage = telephone + '_' + toUUID(req.user.id)
    const blocageRestant = await verifierBlocageOTP(cleBlocage)
    if (blocageRestant) return err(res, `Trop de tentatives incorrectes avec ce client. Réessayez dans ${blocageRestant}h.`, 429)
    const telClean = telephone.replace(/^\+225/, '').replace(/\s/g, '')
    const clientRows = await sql(
      `SELECT c.id::text as cid, c.solde::float as solde, u.id::text as uid, u.role, u.prenom, u.nom, u.telephone, u.statut::text as statut
       FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id
       WHERE u.telephone=$1 OR u.telephone=$2 OR u.telephone=$3 LIMIT 1`,
      telephone, telClean, '+225' + telClean
    )
    if (!clientRows.length) return err(res, 'Client introuvable', 404)
    const client = clientRows[0]
    if (!['client', 'business'].includes(client.role)) return err(res, "Ce compte ne peut pas être débité via Encaisser un client")
    if (!['actif','en_attente'].includes(client.statut)) return err(res, 'Compte client suspendu ou bloqué')
    const mRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const mC = mRows[0]
    if (!mC) return err(res, 'Compte marchand introuvable', 404)

    const { fraisTotal: frais, fraisClient, fraisBusiness } = splitFraisPaiement(amt)
    const totalDebitClient = amt + fraisClient
    if (client.solde < totalDebitClient) return err(res, 'Solde insuffisant chez le client')

    const otp = String(Math.floor(1000 + Math.random() * 9000))
    const businessId = toUUID(req.user.id)
    const key = telephone + '_' + businessId
    await pgPool.query(
      `INSERT INTO otp_encaissements (cle,otp,amt,frais,frais_client,frais_business,total_debit_client,client_id,client_compte_id,client_nom,business_id,business_compte_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()+INTERVAL '3 minutes')
       ON CONFLICT (cle) DO UPDATE SET otp=EXCLUDED.otp,amt=EXCLUDED.amt,frais=EXCLUDED.frais,
       frais_client=EXCLUDED.frais_client,frais_business=EXCLUDED.frais_business,
       total_debit_client=EXCLUDED.total_debit_client,client_id=EXCLUDED.client_id,
       client_compte_id=EXCLUDED.client_compte_id,client_nom=EXCLUDED.client_nom,
       business_id=EXCLUDED.business_id,business_compte_id=EXCLUDED.business_compte_id,expires_at=EXCLUDED.expires_at,tentatives=0`,
      [key,otp,amt,frais,fraisClient,fraisBusiness,totalDebitClient,client.uid,client.cid,
       (client.prenom||'')+' '+(client.nom||''),businessId,mC.id]
    )

    // Le code OTP n'est plus inclus en clair dans le texte de la notification push (qui peut
    // s'afficher sur l'écran verrouillé) : il n'est visible que dans l'app elle-même (bandeau
    // d'accueil + liste des notifications, une fois déverrouillée).
    const bizNom = (req.user.prenom||'') + ' ' + (req.user.nom||'')
    await notifier(client.uid, 'transaction', '🔐 Autorisation de paiement requise',
      `${bizNom || 'Un marchand'} souhaite vous facturer ${amt.toLocaleString('fr-FR')} F CFA. Ouvrez ManiPay pour voir le code à lui communiquer, ou refuser (valable 3 min).`,
      { otp, montant: amt, frais: fraisClient, bizNom, type: 'encaissement_otp' }
    )

    return ok(res, {
      clientNom: (client.prenom||'') + ' ' + (client.nom||''),
      montant: amt, frais, fraisClient, fraisBusiness, totalDebitClient,
      expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      message: "Code OTP envoyé au client. Demandez-lui le code."
    })
  } catch(e) { return err(res, e.message, 500) }
})

// ÉTAPE 2 : Business saisit l'OTP → encaissement exécuté
app.post('/api/v1/transactions/collect/confirm', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'business') return err(res, 'Réservé aux comptes Business', 403)
    const { telephone, otp } = req.body
    const businessId = toUUID(req.user.id)
    const key = telephone + '_' + businessId
    const otpRows = await pgPool.query(`SELECT * FROM otp_encaissements WHERE cle=$1`,[key])
    const otpRow = (Array.isArray(otpRows) ? otpRows : (otpRows.rows||[]))[0] || null

    if (!otpRow) return err(res, 'Aucune demande en attente pour ce client', 400)
    if (new Date() > new Date(otpRow.expires_at)) {
      await pgPool.query(`DELETE FROM otp_encaissements WHERE cle=$1`,[key])
      return err(res, 'Code OTP expiré (3 min). Recommencez.', 400)
    }
    if (String(otp).trim() !== String(otpRow.otp)) {
      const tentatives = Number(otpRow.tentatives || 0) + 1
      if (tentatives >= 3) {
        await pgPool.query(`DELETE FROM otp_encaissements WHERE cle=$1`, [key])
        const offenses = await poserBlocageOTP(key, businessId, otpRow.client_nom, 'encaissement')
        if (offenses >= 2) return err(res, "Compte bloqué après une 2e série de tentatives incorrectes. Contactez le support pour réactivation.", 403)
        return err(res, 'Trop de tentatives incorrectes. Nouvelle demande possible dans 24h.', 429)
      }
      await pgPool.query(`UPDATE otp_encaissements SET tentatives=$1 WHERE cle=$2`, [tentatives, key])
      return err(res, `Code OTP incorrect (${tentatives}/3 tentatives)`, 400)
    }

    // OTP valide → exécuter l'encaissement (logique inchangée par rapport à l'ancienne route en une étape)
    await pgPool.query(`DELETE FROM otp_encaissements WHERE cle=$1`,[key])
    const amt=Number(otpRow.amt), frais=Number(otpRow.frais), fraisClient=Number(otpRow.frais_client)
    const fraisBusiness=Number(otpRow.frais_business), totalDebitClient=Number(otpRow.total_debit_client)
    const clientUid=otpRow.client_id, clientCid=otpRow.client_compte_id, clientNom=otpRow.client_nom
    const mCid=otpRow.business_compte_id

    const ref = 'PAY-' + Date.now().toString(36).toUpperCase()
    const payTxId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,date_creation)
       VALUES ($1,$2,'paiement_marchand','complete',$3,$4,$5,$6,NOW())`,
      [payTxId, ref, clientCid, mCid, amt, frais]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id::text=$2`, [totalDebitClient, clientCid])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text=$2`, [amt - fraisBusiness, mCid])
    verifierRattachement(businessId, 'paiement_marchand_recu', amt-fraisBusiness).catch(() => {})
    const tx = { id: payTxId, reference: ref, montant: amt, frais, fraisClient, fraisBusiness, totalDebitClient, type: 'paiement_marchand', clientNom }

    // Commission parrain du CLIENT débité (agent/master/mini_master 10%, client/business 5%, plafonné)
    let gainParrainPay = 0
    try {
      const rattRows = await sql(
        `SELECT r.id, r.parrain_id, u.role as parrain_role FROM rattachements r
         JOIN utilisateurs u ON u.id::text = r.parrain_id::text
         WHERE r.filleul_id = $1 AND r.statut = 'valide'`,
        clientUid
      )
      if (rattRows && rattRows.length && rattRows[0].parrain_id) {
        const parrainId = rattRows[0].parrain_id
        const { gain, taux } = await calculerGainParrainPlafonne(parrainId, rattRows[0].parrain_role, frais)
        gainParrainPay = gain
        const _saId4 = await getSuperAdminId()
        if (gainParrainPay >= 1 && String(parrainId) !== String(_saId4)) {
          await pgPool.query(
            `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,montant_original,taux,statut,date_calcul)
             VALUES ($1,$2,'parrainage',$3,$3,$4,'en_attente',NOW())`,
            [require('crypto').randomUUID(), parrainId, gainParrainPay, taux]
          )
          console.log('[PARRAIN COLLECT] +' + gainParrainPay + ' FCFA → parrain:', parrainId)
        }
      }
    } catch (ep) { console.warn('[PARRAIN COLLECT]', ep.message) }

    await notifier(clientUid, 'transaction', '🛒 Paiement effectué',
      `Paiement de ${amt.toLocaleString('fr-FR')} F CFA encaissé par ${req.user.prenom || 'un marchand'} (+ ${fraisClient.toLocaleString('fr-FR')} F de frais).`,
      { montant: amt, frais: fraisClient, reference: ref, type: 'paiement_envoye' }
    )
    await notifier(businessId, 'transaction', '💳 Paiement encaissé',
      `Vous avez encaissé ${amt.toLocaleString('fr-FR')} F CFA (frais: ${fraisBusiness.toLocaleString('fr-FR')} F).`,
      { montant: amt, frais: fraisBusiness, reference: ref, type: 'paiement_recu' }
    )

    // Commission réseau : Mini-Master/Master DU BUSINESS (qui traite l'encaissement) reçoit 10%/20% des frais
    const reseauDistribue = await crediterReseauHierarchie(null, businessId, frais, 'paiement_marchand').catch(() => 0)
    const gainManiPay = Math.max(0, frais - gainParrainPay - reseauDistribue)
    creditManiPay(gainManiPay, 'paiement_marchand', ref).catch(() => {})

    return ok(res, tx)
  } catch (e) { return err(res, e.message, 500) }
})

// Forcer statut transaction — admin et support_tech
// ═══ ENREGISTRER TOKEN FCM (par appareil — plusieurs appareils possibles par compte) ═══
app.post('/api/v1/users/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token, deviceId } = req.body
    if (!token) return err(res, 'Token manquant')
    const userId = toUUID(req.user.id)
    await pgPool.query(`UPDATE utilisateurs SET fcm_token=$1 WHERE id=$2`, [token, userId]).catch(()=>{})
    if (deviceId) {
      await pgPool.query(
        `INSERT INTO fcm_tokens (id, utilisateur_id, device_id, fcm_token, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (utilisateur_id, device_id) DO UPDATE SET fcm_token=EXCLUDED.fcm_token, updated_at=NOW()`,
        [require('crypto').randomUUID(), userId, deviceId, token]
      ).catch(()=>{})
    }
    return ok(res, { success: true })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ Géolocalisation — "Trouver des agents" ═══
// Rôles physiquement localisables : Agent, Business, Mini-Master, Master (jamais le Back-Office).
// Modèle "position fixe" : il ne s'agit PAS d'un suivi en temps réel, mais de l'enregistrement
// obligatoire, une seule fois, du lieu d'activité du professionnel — comme chez Wave. Il n'y a
// aucune option pour se masquer : dès que le compte existe, sa position doit être définie, et
// reste affichée en permanence aux clients qui cherchent un agent à proximité.
const ROLES_LOCALISABLES = ['agent', 'business', 'mini_master', 'master']

// Enregistre la position — appelé une seule fois, lors de l'écran obligatoire affiché à
// l'ouverture de l'app tant que position_confirmee n'est pas encore TRUE (nouveau compte, ou
// compte existant migré). Reste modifiable ensuite (ex. déménagement, correction), mais n'est
// plus jamais redemandé de force une fois confirmé.
app.post('/api/v1/position/update', authMiddleware, async (req, res) => {
  try {
    if (!ROLES_LOCALISABLES.includes(req.user.role)) return err(res, 'Fonction réservée aux agents, business, mini-masters et masters', 403)
    const lat = Number(req.body.latitude), lng = Number(req.body.longitude)
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return err(res, 'Coordonnées invalides')
    }
    const userId = toUUID(req.user.id)
    await pgPool.query(
      `UPDATE utilisateurs SET position_latitude=$1, position_longitude=$2, position_maj_le=NOW(), position_confirmee=TRUE WHERE id=$3`,
      [lat, lng, userId]
    )
    return ok(res, { success: true })
  } catch(e) { return err(res, e.message, 500) }
})

// Le Client (ou toute autre app) interroge cette route avec sa propre position pour lister les
// Agents/Business/Mini-Masters/Masters à proximité, triés du plus proche au plus loin. Calcul de
// distance en SQL via la formule de Haversine (pas besoin de l'extension PostGIS). Aucun filtre
// de fraîcheur ni de visibilité : une position enregistrée est toujours affichée, quelle que soit
// l'heure ou le jour — c'est le principe même de la position fixe imposée à l'inscription.
app.get('/api/v1/agents/proximite', authMiddleware, async (req, res) => {
  try {
    const lat = Number(req.query.lat), lng = Number(req.query.lng)
    if (!isFinite(lat) || !isFinite(lng)) return err(res, 'Position manquante ou invalide')
    const rayon = Math.min(Number(req.query.rayon) || 10000, 50000) // mètres — 10 km par défaut, 50 km max
    const rows = await sql(
      `SELECT id::text as id, prenom, nom, nom_commercial as "nomCommercial", role,
              position_latitude as lat, position_longitude as lng, position_maj_le as "positionMajLe",
              (6371000 * acos(
                LEAST(1, GREATEST(-1,
                  cos(radians($1)) * cos(radians(position_latitude)) *
                  cos(radians(position_longitude) - radians($2)) +
                  sin(radians($1)) * sin(radians(position_latitude))
                ))
              )) as distance
       FROM utilisateurs
       WHERE role IN ('agent','business','mini_master','master')
         AND position_confirmee = TRUE
         AND position_latitude IS NOT NULL AND position_longitude IS NOT NULL
         AND statut != 'bloque'
       ORDER BY distance ASC
       LIMIT 200`,
      [lat, lng]
    )
    const proches = rows.filter(r => Number(r.distance) <= rayon).map(r => ({
      id: r.id,
      nom: r.nomCommercial || ((r.prenom || '') + ' ' + (r.nom || '')).trim(),
      role: r.role,
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      distanceMetres: Math.round(Number(r.distance))
    }))
    return ok(res, { agents: proches })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ GET transaction by id ═══
app.get('/api/v1/transactions/:id', authMiddleware, async (req, res) => {
  try {
    const rows = await sql(
      `SELECT t.id::text as id, t.reference, t.type, t.statut, t.montant::float as montant,
              t.frais::float as frais, t.date_creation as "dateCreation",
              t.compte_source_id::text as "compteSourceId", t.compte_dest_id::text as "compteDestId",
              us.prenom as "srcPrenom", us.nom as "srcNom", us.telephone as "srcTel",
              us.nom_commercial as "srcNomCommercial", us.role as "srcRole",
              ud.prenom as "destPrenom", ud.nom as "destNom", ud.telephone as "destTel",
              ud.nom_commercial as "destNomCommercial", ud.role as "destRole"
       FROM transactions t
       LEFT JOIN comptes cs ON cs.id = t.compte_source_id
       LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id
       LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
       LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id
       WHERE t.id::text = $1 LIMIT 1`, req.params.id
    )
    if (!rows.length) return err(res, 'Transaction introuvable', 404)
    return ok(res, rows[0])
  } catch(e) { return err(res, e.message, 500) }
})

app.patch('/api/v1/transactions/:id/status', authMiddleware, role(...SUPPORT_TECH), async (req, res) => {
  try {
    const txSRows = await sql(`UPDATE transactions SET statut=$1 WHERE id=$2 RETURNING id::text as id, reference, type, statut, montant::float as montant`, req.body.statut, req.params.id)
    return ok(res, txSRows[0] || {})
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ REMBOURSEMENT — support_client et admin ═══
// Peut rembourser le dernier transfert OU un transfert spécifique par transactionId
app.post('/api/v1/transactions/refund', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, transactionId } = req.body
    if (!userId) return err(res, 'userId requis')

    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, userId)
    const compte = compteRows[0] || null
    if (!compte) return err(res, 'Compte introuvable', 404)

    let tx = null

    if (transactionId) {
      // Remboursement d'une transaction spécifique
      const txFRows = await sql(`SELECT id::text as id, type, statut, montant::float as montant, compte_source_id as "compteSourceId", compte_dest_id as "compteDestId", date_creation as "dateCreation", reference FROM transactions WHERE id=$1 LIMIT 1`, transactionId)
      tx = txFRows[0] || null
      if (!tx) return err(res, 'Transaction introuvable', 404)
      if (tx.type !== 'transfert') return err(res, 'Seuls les transferts sont remboursables')
      if (tx.statut !== 'complete') return err(res, 'Cette transaction ne peut pas être remboursée')
      // Vérifier que le client est impliqué dans la transaction (source ou dest)
      if (tx.compteSourceId !== compte.id && tx.compteDestId !== compte.id) {
        return err(res, 'Cette transaction ne concerne pas ce client')
      }
      // Pour rembourser : toujours remettre l argent au compte source original
      // Si le client est la source → rembourser vers lui (récupérer depuis dest)
      // Si le client est la dest → pas de remboursement possible depuis ce côté
      // Délai 7 jours
      const limite = new Date(Date.now() - 7*24*60*60*1000)
      if (tx.dateCreation < limite) return err(res, 'Délai de remboursement dépassé (7 jours maximum)')
    } else {
      // Dernier transfert dans les 7 jours
      const limite = new Date(Date.now() - 7*24*60*60*1000)
      const txLastRows = await sql(`SELECT id::text as id, type, statut, montant::float as montant, compte_source_id as "compteSourceId", compte_dest_id as "compteDestId", date_creation as "dateCreation", reference FROM transactions WHERE compte_source_id=$1 AND type='transfert' AND statut='complete' AND date_creation>=$2::timestamptz ORDER BY date_creation DESC LIMIT 1`, compte.id, limite)
      tx = txLastRows[0] || null
      if (!tx) return err(res, 'Aucun transfert remboursable dans les 7 derniers jours', 404)
    }

    // Vérifier que le destinataire a les fonds
    const destCRows = await sql(`SELECT id::text as id, solde::float as solde FROM comptes WHERE id=$1 LIMIT 1`, tx.compteDestId)
    const destCompte = destCRows[0] || null
    if (!destCompte) return err(res, 'Compte destinataire introuvable')
    const ref = 'RMB-'+Date.now().toString(36).toUpperCase()
    // Utiliser SQL brut pour éviter les problèmes de schéma Prisma
    const newId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id, reference, type, statut, compte_source_id, compte_dest_id, montant, frais, date_creation)
       VALUES ($1, $2, 'transfert', 'complete', $3, $4, $5, 0, NOW())`,
      [newId, ref, tx.compteDestId, tx.compteSourceId, tx.montant]
    )
    await pgPool.query(
      `UPDATE comptes SET solde = solde - $1 WHERE id::text = $2`,
      [tx.montant, tx.compteDestId]
    )
    await pgPool.query(
      `UPDATE comptes SET solde = solde + $1 WHERE id::text = $2`,
      [tx.montant, tx.compteSourceId]
    )
    await pgPool.query(
      `UPDATE transactions SET statut = 'annule' WHERE id = $1`,
      [tx.id]
    )
    return ok(res, { message: 'Remboursement effectué', montant: tx.montant, reference: ref, transactionOrigine: tx.reference })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ SUSPENDRE DESTINATAIRE — support_client peut suspendre temporairement ═══
app.patch('/api/v1/users/:id/suspend', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { motif } = req.body
    const suspRows = await sql(`UPDATE utilisateurs SET statut='suspendu', updated_at=NOW() WHERE id=$1 RETURNING id::text as id, prenom, nom, telephone, statut`, req.params.id)
    const user = suspRows[0] || {id:req.params.id}
    // Créer un ticket d'enquête automatique
    const ref_s = 'TKT-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES (gen_random_uuid(), $1, 'Suspension preventive - Enquete remboursement', $2, 'en_cours', 'support_client', 'normal', $3, NOW())`,
      [ref_s, motif || 'Compte suspendu suite a demande de remboursement. Enquete en cours.', req.params.id]
    ).catch(() => {})
    // Notification suspension
    await notifier(req.params.id, 'securite', '⚠️ Compte suspendu',
      motif || 'Votre compte ManiPay a été suspendu temporairement. Soumettez des documents valides pour réactivation.',
      { statut: 'suspendu', motif: motif || null }
    )
    return ok(res, { message: 'Compte suspendu', user })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ COMMISSIONS ═══
app.get('/api/v1/commissions/summary', authMiddleware, async (req, res) => {
  try {
    const uid = toUUID(req.user.id)
    const isAdmin = ADMIN_SUP.includes(req.user.role)
    const now = new Date()
    const debut = new Date(now.getFullYear(), now.getMonth(), 1)
    const whereClause = isAdmin ? '' : 'WHERE beneficiaire_id = $1'
    const params = isAdmin ? [] : [uid]
    const [t, m] = await Promise.all([
      sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions ${whereClause}`, ...params),
      sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions ${whereClause ? whereClause + ' AND date_calcul >= $' + (params.length+1) + '::timestamptz' : 'WHERE date_calcul >= $1::timestamptz'}`, ...params, debut)
    ])
    return ok(res, { totalHistorique: t[0]?.total||0, totalMois: m[0]?.total||0 })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ STATS ═══
app.get('/api/v1/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const cRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const c = cRows[0] ? { id: cRows[0].id, solde: cRows[0].solde } : null
    const bw=c?{OR:[{compteSourceId:c.id},{compteDestId:c.id}]}:{}
    const canSeeGlobal = ADMIN_SUP.includes(req.user.role) || req.user.role === 'support_tech'
    const toUUID_g = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const gainsSql = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id = $1 AND date_calcul >= $2::timestamptz`,
      toUUID_g(toUUID(req.user.id)), debut
    )
    // Raw SQL pour éviter TypeTransaction enum
    const toUUID_d = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const cId = c ? toUUID_d(c.id) : null
    const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [depR, retR, txJR] = await Promise.all([
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE compte_dest_id = $1 AND type='depot' AND date_creation >= $2::timestamptz`, cId, debut) : [{n:0}],
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE compte_source_id = $1 AND type='retrait' AND date_creation >= $2::timestamptz`, cId, debut) : [{n:0}],
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE (compte_source_id = $1 OR compte_dest_id = $1) AND date_creation >= $2::timestamptz`, cId, aujourdhui) : [{n:0}]
    ])
    const dep = depR[0]?.n || 0
    const ret = retR[0]?.n || 0
    const txJ = txJR[0]?.n || 0
    const [users, alertes, tickets] = await Promise.all([
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM utilisateurs`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0),
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM alertes_fraude WHERE statut='active'`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0),
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM tickets_support WHERE statut='ouvert'`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0)
    ])
    return ok(res, {depotsMois:{count:dep},retraitsMois:{count:ret},gainsMois:gainsSql[0]?.total||0,txJour:txJ,totalUtilisateurs:users,alertesActives:alertes,ticketsOuverts:tickets})
  } catch (e) { return err(res, e.message, 500) }
})

// Overview admin
app.get('/api/v1/admin/overview', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const [users, txns, alertes] = await Promise.all([
      sql(`SELECT COUNT(*)::int as n FROM utilisateurs`).then(r=>r[0]?.n||0),
      sql(`SELECT COUNT(*)::int as n FROM transactions`).then(r=>r[0]?.n||0),
      sql(`SELECT COUNT(*)::int as n FROM alertes_fraude WHERE statut='active'`).then(r=>r[0]?.n||0).catch(()=>0)
    ])
    // Gains ManiPay = uniquement les frais de plateforme (gain_plateforme_retrait/paiement)
    // On exclut tout ce qui serait des commissions personnelles (parrainage, réseau)
    // même si elles sont créditées au même utilisateur MANI_PAY_USER_ID
    const gains = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
       WHERE beneficiaire_id = $1
         AND type_commission IN ('gain_plateforme_retrait','gain_plateforme_paiement_marchand')`,
      MANI_PAY_USER_ID
    )
    const charges = await sql(`
      SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
      WHERE type_commission IN (
        'commission_journaliere',
        'parrainage','commission_parrain',
        'reseau_mini_master_retrait','reseau_mini_master_paiement',
        'reseau_master_retrait','reseau_master_paiement',
        'reseau_master_retrait_mm','reseau_master_paiement_mm'
      )
        AND beneficiaire_id::text != $1
    `, MANI_PAY_USER_ID)
    const virements = await sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM transactions WHERE type = 'virement_manipay' AND statut = 'complete'`)
    const net = Math.max(0, (gains[0]?.total||0) - (charges[0]?.total||0) - (virements[0]?.total||0))
    return ok(res, { users, txns, totalCommissions: net, alertes })
  } catch (e) { return err(res, e.message, 500) }
})

// ── Recherche rapide utilisateur par téléphone (pour virement ManiPay) ──
app.get('/api/v1/admin/users/search', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const { telephone } = req.query
    if (!telephone || telephone.length < 8) return ok(res, { users: [] })
    const rows = await sql(`
      SELECT id::text as id, prenom, nom, telephone, role, statut
      FROM utilisateurs WHERE telephone = $1 LIMIT 1
    `, telephone)
    return ok(res, { users: rows })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ DIAGNOSTIC TEMPORAIRE — commissions breakdown ═══
app.get('/api/v1/admin/debug/commissions', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const rows = await pgPool.query(`
      SELECT type_commission, statut,
             COUNT(*)::int as nb,
             COALESCE(SUM(montant),0)::float as total,
             MIN(beneficiaire_id::text) as sample_beneficiaire
      FROM commissions
      GROUP BY type_commission, statut
      ORDER BY total DESC
    `)
    const maniRows = await pgPool.query(`
      SELECT type_commission, COUNT(*)::int as nb, COALESCE(SUM(montant),0)::float as total
      FROM commissions WHERE beneficiaire_id::text = $1 GROUP BY type_commission
    `, [MANI_PAY_USER_ID])
    return ok(res, { all: rows.rows, maniPay: maniRows.rows, maniUserId: MANI_PAY_USER_ID })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ REMBOURSEMENTS ═══
const REMB_DELAI_SUPPORT = 7    // jours max pour support_client
const REMB_DELAI_ADMIN   = 90   // jours max pour admin/backoffice

// Liste des transactions remboursables (dépôts + transferts)
app.get('/api/v1/admin/transactions/remboursables', authMiddleware, role('admin','backoffice','superviseur','support_client'), async (req, res) => {
  try {
    const { jours = 7, type, telephone } = req.query
    const delaiMax = ['admin','backoffice','superviseur'].includes(req.user.role) ? REMB_DELAI_ADMIN : REMB_DELAI_SUPPORT
    const j = Math.min(parseInt(jours) || 7, delaiMax)

    let typeWhere = `t.type IN ('depot','transfert')`
    if (type === 'depot') typeWhere = `t.type = 'depot'`
    else if (type === 'transfert') typeWhere = `t.type = 'transfert'`

    const params = []
    let telWhere = ''
    if (telephone) {
      params.push(telephone)
      telWhere = `AND (u_src.telephone = $${params.length} OR u_dst.telephone = $${params.length})`
    }

    const rows = await pgPool.query(`
      SELECT
        t.id::text as id, t.reference, t.type, t.statut,
        t.montant::float as montant,
        t.date_creation as "dateCreation",
        u_src.prenom as "prenomSrc", u_src.nom as "nomSrc", u_src.telephone as "telSrc",
        u_dst.prenom as "prenomDst", u_dst.nom as "nomDst", u_dst.telephone as "telDst",
        EXISTS(SELECT 1 FROM transactions tr2 WHERE tr2.reference = 'RMB-' || t.reference AND tr2.statut='complete') as rembourse
      FROM transactions t
      LEFT JOIN comptes c_src ON c_src.id = t.compte_source_id
      LEFT JOIN comptes c_dst ON c_dst.id = t.compte_dest_id
      LEFT JOIN utilisateurs u_src ON u_src.id = c_src.utilisateur_id
      LEFT JOIN utilisateurs u_dst ON u_dst.id = c_dst.utilisateur_id
      WHERE ${typeWhere}
        AND t.statut IN ('complete')
        AND t.type NOT IN ('remboursement','virement_commission')
        AND NOT EXISTS(SELECT 1 FROM transactions tr2 WHERE tr2.reference = 'RMB-' || t.reference AND tr2.statut='complete')
        AND t.date_creation >= NOW() - INTERVAL '${j} days'
        ${telWhere}
      ORDER BY t.date_creation DESC
      LIMIT 200
    `, params)
    return ok(res, rows.rows)
  } catch(e) { return err(res, e.message, 500) }
})

// Effectuer le remboursement d'une transaction
app.post('/api/v1/admin/transactions/:id/rembourser', authMiddleware, role('admin','backoffice','superviseur','support_client'), async (req, res) => {
  try {
    const txId = req.params.id
    const { motif = 'Remboursement' } = req.body
    const isAdmin = ['admin','backoffice','superviseur'].includes(req.user.role)

    // Récupérer la transaction
    const txRows = await pgPool.query(`
      SELECT t.id::text, t.reference, t.type, t.statut,
             t.montant::float as montant,
             t.compte_source_id::text as "cptSrc",
             t.compte_dest_id::text as "cptDst",
             t.date_creation as "dateCreation"
      FROM transactions t WHERE t.id = $1 LIMIT 1
    `, [txId])
    const tx = txRows.rows[0]
    if (!tx) return err(res, 'Transaction introuvable', 404)
    if (tx.statut !== 'complete') return err(res, 'Seules les transactions complètes peuvent être remboursées')
    if (!['depot','transfert'].includes(tx.type)) return err(res, 'Type non remboursable')

    // Vérifier le délai
    const ageJours = (Date.now() - new Date(tx.dateCreation)) / 86400000
    const delaiMax = isAdmin ? REMB_DELAI_ADMIN : REMB_DELAI_SUPPORT
    if (ageJours > delaiMax) return err(res, `Délai dépassé : cette transaction a ${Math.floor(ageJours)} jours (max ${delaiMax}j pour votre rôle)`)

    // Vérifier qu'elle n'est pas déjà remboursée
    const dejaRows = await pgPool.query(
      `SELECT id FROM transactions WHERE reference = $1 AND statut='complete' LIMIT 1`,
      ['RMB-' + tx.reference]
    )
    if (dejaRows.rows.length > 0) return err(res, 'Cette transaction a déjà été remboursée')

    // Vérifier solde suffisant du compte destination pour débit
    const cptDstRows = await pgPool.query(`SELECT solde::float as solde FROM comptes WHERE id::text=$1 LIMIT 1`, [tx.cptDst])
    const soldeDst = cptDstRows.rows[0]?.solde || 0
    if (soldeDst < tx.montant) return err(res, `Solde insuffisant pour le remboursement (disponible : ${soldeDst})`)

    // Inverser le flux : débiter le destinataire, créditer la source
    await pgPool.query(`UPDATE comptes SET solde = solde - $1 WHERE id::text = $2`, [tx.montant, tx.cptDst])
    await pgPool.query(`UPDATE comptes SET solde = solde + $1 WHERE id::text = $2`, [tx.montant, tx.cptSrc])

    // Enregistrer la transaction de remboursement
    const rmbId = require('crypto').randomUUID()
    const rmbRef = 'RMB-' + tx.reference
    await pgPool.query(`
      INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
      VALUES ($1,$2,'remboursement','complete',$3,$4,$5,0,$6,NOW())
    `, [rmbId, rmbRef, tx.cptDst, tx.cptSrc, tx.montant, toUUID(req.user.id)])

    // Marquer la transaction originale comme remboursée
    await pgPool.query(`UPDATE transactions SET statut='rembourse' WHERE id=$1`, [txId])

    // Notifier les deux comptes
    const [srcU, dstU] = await Promise.all([
      pgPool.query(`SELECT u.id::text,u.prenom FROM utilisateurs u JOIN comptes c ON c.utilisateur_id=u.id WHERE c.id::text=$1 LIMIT 1`,[tx.cptSrc]),
      pgPool.query(`SELECT u.id::text,u.prenom FROM utilisateurs u JOIN comptes c ON c.utilisateur_id=u.id WHERE c.id::text=$1 LIMIT 1`,[tx.cptDst])
    ])
    if(srcU.rows[0]) await notifier(srcU.rows[0].id,'transaction','↩ Remboursement reçu',`Remboursement de ${tx.montant.toLocaleString('fr-FR')} (${motif}). Réf: ${rmbRef}`,{montant:tx.montant}).catch(()=>{})
    if(dstU.rows[0]) await notifier(dstU.rows[0].id,'transaction','↩ Remboursement émis',`${tx.montant.toLocaleString('fr-FR')} débités de votre compte (remboursement ${tx.reference}).`,{montant:tx.montant}).catch(()=>{})

    return ok(res, { message: 'Remboursement effectué', reference: rmbRef, montant: tx.montant })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ INSCRIPTIONS ═══
app.get('/api/v1/admin/inscriptions', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const { role: roleFiltre, limit = 200 } = req.query
    const lim = Math.min(parseInt(limit) || 200, 1000)
    const params = []
    let where = ''
    if (roleFiltre) { params.push(roleFiltre); where = `WHERE u.role = $${params.length}` }
    const inscriptions = await sql(`
      SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut,
             u.created_at as "createdAt",
             p.prenom as "parrainPrenom", p.nom as "parrainNom", p.role as "parrainRole"
      FROM utilisateurs u
      LEFT JOIN utilisateurs p ON p.id = u.parrain_id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ${lim}
    `, ...params)
    const countsRows = await sql(`
      SELECT role, COUNT(*)::int as n FROM utilisateurs
      WHERE role IN ('master','mini_master','agent','business','client')
      GROUP BY role
    `)
    const counts = {}
    countsRows.forEach(r => { counts[r.role] = r.n })
    return ok(res, { inscriptions, counts })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ RATTACHEMENTS — visibilité et gestion réservées à admin + backoffice ═══
// Les agents ne voient JAMAIS leurs filleuls rattachés (anti-démarchage).
// Seul le back-office a une vue complète + droit de rattacher/détacher manuellement.

// Liste complète des rattachements (parrain ↔ filleul) avec recherche optionnelle
app.get('/api/v1/admin/rattachements', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const search = (req.query.search || '').trim()
    const statut = req.query.statut || null // 'valide' | 'en_cours' | null (tous)
    let q = `
      SELECT
        r.id::text as id, r.statut, r.date_entree::text as "dateEntree", r.date_sortie::text as "dateSortie", r.created_at::text as "createdAt",
        r.parrain_id as "parrainIdRaw", r.filleul_id as "filleulIdRaw",
        p.id::text as "parrainId", p.prenom as "parrainPrenom", p.nom as "parrainNom", p.telephone as "parrainTelephone", p.role as "parrainRole",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc"
      FROM rattachements r
      LEFT JOIN utilisateurs p ON p.id::text = r.parrain_id::text
      LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE 1=1`
    const params = []
    if (statut) { params.push(statut); q += ` AND r.statut = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (p.telephone ILIKE $${params.length} OR f.telephone ILIKE $${params.length} OR p.nom ILIKE $${params.length} OR f.nom ILIKE $${params.length} OR p.prenom ILIKE $${params.length} OR f.prenom ILIKE $${params.length})`
    }
    q += ` ORDER BY r.created_at DESC LIMIT 1000`
    const rows = await sql(q, ...params)
    // Signaler les rattachements orphelins (parrain ou filleul introuvable en base) pour diagnostic
    const orphelins = rows.filter(r => !r.parrainId || !r.filleulId)
    if (orphelins.length > 0) {
      console.warn(`[RATTACHEMENTS] ${orphelins.length} rattachement(s) orphelin(s) détecté(s):`, orphelins.map(o => ({id:o.id, parrainIdRaw:o.parrainIdRaw, filleulIdRaw:o.filleulIdRaw})))
    }
    return ok(res, { rattachements: rows, total: rows.length, orphelins: orphelins.length })
  } catch (e) { return err(res, e.message, 500) }
})

// ─── Parrainés non rattachés : ont un parrain_id mais pas de ligne rattachements ───
app.get('/api/v1/admin/rattachements/non-rattaches', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const rows = await sql(`
      SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut,
             u.kyc_niveau as "kycNiveau", u.created_at::text as "createdAt",
             p.prenom as "parrainPrenom", p.nom as "parrainNom",
             p.telephone as "parrainTelephone", p.role as "parrainRole"
      FROM utilisateurs u
      JOIN utilisateurs p ON p.id = u.parrain_id
      WHERE u.parrain_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM rattachements r WHERE r.filleul_id = u.id
        )
      ORDER BY u.created_at DESC
      LIMIT 500
    `)
    return ok(res, { utilisateurs: rows, total: rows.length })
  } catch (e) {
    console.error('[NON-RATTACHES] ERREUR:', e.message)
    return err(res, e.message, 500)
  }
})

// Vue détaillée pour un utilisateur précis : son parrain + la liste de ses filleuls rattachés
app.get('/api/v1/admin/rattachements/:userId', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const userId = req.params.userId
    const parrainRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        p.id::text as "parrainId", p.prenom as "parrainPrenom", p.nom as "parrainNom", p.telephone as "parrainTelephone", p.role as "parrainRole"
      FROM rattachements r LEFT JOIN utilisateurs p ON p.id::text = r.parrain_id::text
      WHERE r.filleul_id = $1`, userId)
    const filleulsRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc"
      FROM rattachements r LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE r.parrain_id = $1 ORDER BY r.created_at DESC`, userId)
    return ok(res, { parrain: parrainRows[0] || null, filleuls: filleulsRows })
  } catch (e) { return err(res, e.message, 500) }
})

// Recherche d'un parrain par téléphone : retourne ses infos + liste complète de ses filleuls + compte exact
app.get('/api/v1/admin/rattachements/par-telephone', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const telephone = (req.query.telephone || '').trim()
    console.log('[PAR-TELEPHONE] requête reçue, query brut:', JSON.stringify(req.query), '| telephone extrait:', JSON.stringify(telephone), '| user:', req.user.telephone, req.user.role)
    if (!telephone) return err(res, 'telephone requis', 400)
    const parrainRows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, kyc_niveau as "kycNiveau" FROM utilisateurs WHERE telephone = $1 LIMIT 1`, telephone)
    console.log('[PAR-TELEPHONE] résultat sql():', JSON.stringify(parrainRows))
    const parrain = parrainRows[0] || null
    if (!parrain) {
      console.warn('[RATTACHEMENTS] par-telephone: aucun utilisateur trouvé pour', JSON.stringify(telephone))
      return err(res, 'Aucun utilisateur trouvé avec ce numéro', 404)
    }
    const filleulsRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc", f.role as "filleulRole"
      FROM rattachements r LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE r.parrain_id = $1 ORDER BY r.created_at DESC`, parrain.id)
    return ok(res, { parrain, filleuls: filleulsRows, total: filleulsRows.length })
  } catch (e) { return err(res, e.message, 500) }
})

// Liste des comptes n'ayant AUCUN filleul rattaché (pour relance commerciale)
// Inclut tous les rôles (client compris, puisqu'un client peut aussi être parrain)
app.get('/api/v1/admin/rattachements/sans-filleul', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const search = (req.query.search || '').trim()
    const roleFilter = req.query.role || null
    console.log('[SANS-FILLEUL] requête reçue, query:', JSON.stringify(req.query), '| user:', req.user.telephone, req.user.role)
    // Étape 1 : récupérer les IDs des parrains actifs (requête légère, sans jointure)
    const parrainsActifs = await sql(`SELECT DISTINCT parrain_id FROM rattachements WHERE statut = 'valide' AND parrain_id IS NOT NULL`)
    const parrainsActifsSet = new Set(parrainsActifs.map(r => String(r.parrain_id)))
    console.log('[SANS-FILLEUL] parrains actifs trouvés:', parrainsActifs.length)
    // Étape 2 : récupérer les utilisateurs SANS parrain (parrain_id IS NULL), avec filtres simples
    let q = `SELECT id::text as id, prenom, nom, telephone, role, statut, kyc_niveau as "kycNiveau", created_at::text as "createdAt" FROM utilisateurs WHERE parrain_id IS NULL`
    const params = []
    if (roleFilter) { params.push(roleFilter); q += ` AND role = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (telephone ILIKE $${params.length} OR nom ILIKE $${params.length} OR prenom ILIKE $${params.length})`
    }
    q += ` ORDER BY created_at DESC LIMIT 1000`
    const allRows = await sql(q, ...params)
    console.log('[SANS-FILLEUL] total utilisateurs sans parrain (avant filtre):', allRows.length)
    // Exclut en plus ceux qui SONT déjà parrain actif de quelqu'un (= ont un filleul)
    const rows = allRows.filter(u => !parrainsActifsSet.has(String(u.id))).slice(0, 500)
    console.log('[SANS-FILLEUL] après exclusion parrains actifs:', rows.length)
    return ok(res, { utilisateurs: rows, total: rows.length })
  } catch (e) {
    console.error('[SANS-FILLEUL] ERREUR:', e.message, e.stack)
    return err(res, e.message, 500)
  }
})

// ═══ SEGMENTATION — filtrer des utilisateurs sur des critères combinés ═══
// Calcul entièrement en mémoire (JS) pour rester rapide et stable, conformément
// aux leçons tirées des bugs de latence sur les routes rattachements.
// ═══ GAINS SYSTÈME — tableau de bord financier ManiPay ═══
app.get('/api/v1/admin/gains-systeme', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const now = new Date()
    const dAuj   = new Date(now); dAuj.setHours(0,0,0,0)
    const dSem   = new Date(now); dSem.setDate(now.getDate()-now.getDay()); dSem.setHours(0,0,0,0)
    const dMois  = new Date(now.getFullYear(), now.getMonth(), 1)
    const dAnnee = new Date(now.getFullYear(), 0, 1)
    const dAujPrec  = new Date(dAuj); dAujPrec.setDate(dAujPrec.getDate()-1)
    const dSemPrec  = new Date(dSem); dSemPrec.setDate(dSemPrec.getDate()-7)
    const dMoisPrec = new Date(dMois); dMoisPrec.setMonth(dMoisPrec.getMonth()-1)
    const dAnnPrec  = new Date(now.getFullYear()-1, 0, 1)

    const qP = async (benefId, debut, fin) => {
      try {
        let cond
        if (benefId === '!system') {
          cond = `beneficiaire_id::text != '${MANI_PAY_USER_ID}'`
        } else if (benefId === MANI_PAY_USER_ID) {
          // Pour ManiPay : seulement les vrais gains plateforme, pas les commissions personnelles
          cond = `beneficiaire_id = '${benefId}' AND type_commission IN ('gain_plateforme_retrait','gain_plateforme_paiement_marchand')`
        } else {
          cond = `beneficiaire_id = '${benefId}'`
        }
        const params = fin ? [debut, fin] : [debut]
        const where = fin ? `AND date_calcul >= $1 AND date_calcul < $2` : `AND date_calcul >= $1`
        const r = await pgPool.query(
          `SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
           FROM commissions WHERE ${cond} ${where}`, params
        )
        return { total: r.rows[0]?.total||0, nb: r.rows[0]?.nb||0 }
      } catch(e) {
        console.warn('[qP] error:', e.message)
        return { total: 0, nb: 0 }
      }
    }

    // Courbe gains ManiPay par jour (ce mois)
    const courbeAPRows = await pgPool.query(`
      SELECT DATE(date_calcul) as jour, type_commission,
             COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
      FROM commissions WHERE beneficiaire_id = $1 AND date_calcul >= $2
      GROUP BY DATE(date_calcul), type_commission ORDER BY jour ASC
    `, [MANI_PAY_USER_ID, dAnnee]).catch(()=>({rows:[]}))

    // Courbe gains par rôle et par jour sur TOUTE l'année (pour le graphique comparatif)
    // Le front choisira la période et filtrera côté JS
    const courbeParRoleRows = await pgPool.query(`
      SELECT u.role, DATE(c.date_calcul) as jour,
             COALESCE(SUM(c.montant),0)::float as total,
             COUNT(*)::int as nb
      FROM commissions c
      JOIN utilisateurs u ON u.id::text = c.beneficiaire_id::text
      WHERE c.beneficiaire_id::text != $1
        AND c.date_calcul >= $2
        AND u.role IN ('agent','client','master','mini_master')
      GROUP BY u.role, DATE(c.date_calcul)
      ORDER BY jour ASC
    `, [MANI_PAY_USER_ID, dAnnee]).catch(()=>({rows:[]}))

    // Courbe par rôle + type d'opération + jour (pour le 3ème filtre)
    const courbeParRoleTypeRows = await pgPool.query(`
      SELECT u.role, c.type_commission, DATE(c.date_calcul) as jour,
             COALESCE(SUM(c.montant),0)::float as total,
             COUNT(*)::int as nb
      FROM commissions c
      JOIN utilisateurs u ON u.id::text = c.beneficiaire_id::text
      WHERE c.beneficiaire_id::text != $1
        AND c.date_calcul >= $2
        AND u.role IN ('agent','client','master','mini_master')
      GROUP BY u.role, c.type_commission, DATE(c.date_calcul)
      ORDER BY jour ASC
    `, [MANI_PAY_USER_ID, dAnnee]).catch(()=>({rows:[]}))

    // Tous les calculs en parallèle
    const [
      apAuj, apAujP, apSem, apSemP, apMois, apMoisP, apAnn, apAnnP, apTot,
      soldeRows, chargesJournaRows, chargesParrainRows, chargesReseauRows, gainsParType, virements,
      uAuj, uAujP, uSem, uSemP, uMois, uMoisP, uAnn, uAnnP, uTot,
      gainsParRole, gainsUtilParType, top10, gainsParRoleType
    ] = await Promise.all([
      qP(MANI_PAY_USER_ID, dAuj),
      qP(MANI_PAY_USER_ID, dAujPrec, dAujPrec.setHours(23,59,59,999) && dAuj),
      qP(MANI_PAY_USER_ID, dSem),
      qP(MANI_PAY_USER_ID, dSemPrec, dSem),
      qP(MANI_PAY_USER_ID, dMois),
      qP(MANI_PAY_USER_ID, dMoisPrec, dMois),
      qP(MANI_PAY_USER_ID, dAnnee),
      qP(MANI_PAY_USER_ID, dAnnPrec, dAnnee),
      pgPool.query(`SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb FROM commissions WHERE beneficiaire_id = $1 AND type_commission IN ('gain_plateforme_retrait','gain_plateforme_paiement_marchand')`, [MANI_PAY_USER_ID]),
      pgPool.query(`SELECT solde::float as solde FROM comptes WHERE id::text = $1 LIMIT 1`, [MANI_PAY_COMPTE_ID]),
      // ── CHARGES versées aux agents/mini-masters/clients par ManiPay ──
      // 1. Commissions journalières (27 paliers volumétriques)
      pgPool.query(`
        SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
        FROM commissions
        WHERE type_commission = 'commission_journaliere'
          AND beneficiaire_id::text != $1
      `, [MANI_PAY_USER_ID]),
      // 2. Commissions parrainage (5%)
      pgPool.query(`
        SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
        FROM commissions
        WHERE type_commission IN ('parrainage','commission_parrain')
          AND beneficiaire_id::text != $1
      `, [MANI_PAY_USER_ID]),
      // 3. Commissions réseau mini-master/master (1-2%)
      pgPool.query(`
        SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
        FROM commissions
        WHERE type_commission IN ('reseau_mini_master_retrait','reseau_mini_master_paiement','reseau_master_retrait','reseau_master_paiement','reseau_master_retrait_mm','reseau_master_paiement_mm')
          AND beneficiaire_id::text != $1
      `, [MANI_PAY_USER_ID]),
      pgPool.query(`SELECT type_commission, COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb FROM commissions WHERE beneficiaire_id = $1 GROUP BY type_commission ORDER BY total DESC`, [MANI_PAY_USER_ID]),
      pgPool.query(`
        SELECT t.id::text, t.reference, t.montant::float, t.description,
               t.date_creation::text,
               u.prenom as dest_prenom, u.nom as dest_nom,
               u.telephone as dest_telephone, u.role as dest_role
        FROM transactions t
        LEFT JOIN comptes c ON c.id::text = t.compte_dest_id::text
        LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id
        WHERE t.type = 'virement_manipay'
        ORDER BY t.date_creation DESC LIMIT 20
      `).catch(()=>({rows:[]})),
      qP('!system', dAuj),
      qP('!system', dAujPrec, dAuj),
      qP('!system', dSem),
      qP('!system', dSemPrec, dSem),
      qP('!system', dMois),
      qP('!system', dMoisPrec, dMois),
      qP('!system', dAnnee),
      qP('!system', dAnnPrec, dAnnee),
      pgPool.query(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id::text != $1`, [MANI_PAY_USER_ID]),
      pgPool.query(`SELECT u.role, COALESCE(SUM(c.montant),0)::float as total, COUNT(DISTINCT c.beneficiaire_id)::int as nb_beneficiaires, COUNT(*)::int as nb_commissions FROM commissions c JOIN utilisateurs u ON u.id::text = c.beneficiaire_id::text WHERE c.beneficiaire_id::text != $1 GROUP BY u.role ORDER BY total DESC`, [MANI_PAY_USER_ID]),
      pgPool.query(`SELECT type_commission, COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb FROM commissions WHERE beneficiaire_id::text != $1 GROUP BY type_commission ORDER BY total DESC`, [MANI_PAY_USER_ID]),
      pgPool.query(`SELECT u.prenom, u.nom, u.telephone, u.role, COALESCE(SUM(c.montant),0)::float as total_gains, COUNT(*)::int as nb_commissions FROM commissions c JOIN utilisateurs u ON u.id::text = c.beneficiaire_id::text WHERE c.beneficiaire_id::text != $1 GROUP BY u.id, u.prenom, u.nom, u.telephone, u.role ORDER BY total_gains DESC LIMIT 10`, [MANI_PAY_USER_ID]).catch(()=>({rows:[]})),
      pgPool.query(`
        SELECT u.role, c.type_commission,
               COALESCE(SUM(c.montant),0)::float as total,
               COUNT(*)::int as nb
        FROM commissions c
        JOIN utilisateurs u ON u.id::text = c.beneficiaire_id::text
        WHERE c.beneficiaire_id::text != $1
          AND u.role IN ('agent','client','master','mini_master')
        GROUP BY u.role, c.type_commission
        ORDER BY u.role, total DESC
      `, [MANI_PAY_USER_ID]).catch(()=>({rows:[]}))
    ])

    const pct = (a, b) => b === 0 ? null : Math.round((a - b) / b * 100)

    // Total virements déjà effectués depuis le compte ManiPay
    const totalVirementsRows = await pgPool.query(
      `SELECT COALESCE(SUM(montant),0)::float as total, COUNT(*)::int as nb
       FROM transactions WHERE type = 'virement_manipay' AND statut = 'complete'`
    ).catch(()=>({rows:[{total:0,nb:0}]}))
    const totalVirements = totalVirementsRows.rows[0]?.total || 0

    return ok(res, {
      maniPay: {
        solde: soldeRows.rows[0]?.solde||0,
        totalVirements,
        pnl: {
          gains_retrait: (gainsParType.rows.find(r=>r.type_commission==='gain_plateforme_retrait')||{}).total||0,
          gains_retrait_nb: (gainsParType.rows.find(r=>r.type_commission==='gain_plateforme_retrait')||{}).nb||0,
          gains_paiement: (gainsParType.rows.find(r=>r.type_commission==='gain_plateforme_paiement_marchand')||{}).total||0,
          gains_paiement_nb: (gainsParType.rows.find(r=>r.type_commission==='gain_plateforme_paiement_marchand')||{}).nb||0,
          // Nouveaux noms
          commissions_journalieres: chargesJournaRows.rows[0]?.total||0,
          commissions_journalieres_nb: chargesJournaRows.rows[0]?.nb||0,
          commissions_parrainage: chargesParrainRows.rows[0]?.total||0,
          commissions_parrainage_nb: chargesParrainRows.rows[0]?.nb||0,
          commissions_reseau: chargesReseauRows.rows[0]?.total||0,
          commissions_reseau_nb: chargesReseauRows.rows[0]?.nb||0,
          // Anciens noms (compatibilité backoffice.html non mis à jour)
          bonus_commission_journaliere: chargesJournaRows.rows[0]?.total||0,
          bonus_depot_nb: chargesJournaRows.rows[0]?.nb||0,
          commissions_parrain: chargesParrainRows.rows[0]?.total||0,
          commissions_parrain_nb: chargesParrainRows.rows[0]?.nb||0
        },
        periodes: {
          aujourdhui: { ...apAuj, vs: pct(apAuj.total, apAujP.total) },
          semaine:    { ...apSem, vs: pct(apSem.total, apSemP.total) },
          mois:       { ...apMois, vs: pct(apMois.total, apMoisP.total) },
          annee:      { ...apAnn, vs: pct(apAnn.total, apAnnP.total) },
          total:      { total: apTot.rows[0]?.total||0, nb: apTot.rows[0]?.nb||0 }
        },
        parType: gainsParType.rows,
        virements: virements.rows,
        courbe: courbeAPRows.rows
      },
      utilisateurs: {
        periodes: {
          aujourdhui: { ...uAuj, vs: pct(uAuj.total, uAujP.total) },
          semaine:    { ...uSem, vs: pct(uSem.total, uSemP.total) },
          mois:       { ...uMois, vs: pct(uMois.total, uMoisP.total) },
          annee:      { ...uAnn, vs: pct(uAnn.total, uAnnP.total) },
          total:      { total: uTot.rows[0]?.total||0 }
        },
        parRole: gainsParRole.rows,
        parType: gainsUtilParType.rows,
        top10: top10.rows,
        courbeParRole: courbeParRoleRows.rows,
        courbeParRoleType: courbeParRoleTypeRows.rows,
        parRoleType: gainsParRoleType.rows
      }
    })
  } catch(e) { return err(res, e.message, 500) }
})

app.post('/api/v1/admin/segmentation', authMiddleware, role(...ADMIN_ONLY, 'superviseur'), async (req, res) => {
  try {
    const c = req.body || {}
    // Un superviseur ne peut cibler que les 4 entités professionnelles (jamais client, ni personnel interne)
    if (req.user.role === 'superviseur') {
      const rolesAutorises = ['agent','business','mini_master','master']
      c.roles = (c.roles && c.roles.length) ? c.roles.filter(r => rolesAutorises.includes(r)) : rolesAutorises
    }
    // 1. Charger les utilisateurs (filtre rôle simple en SQL, le reste en mémoire)
    let uq = `SELECT id::text as id, prenom, nom, telephone, role, statut, kyc_niveau as "kycNiveau", created_at::text as "createdAt" FROM utilisateurs WHERE 1=1`
    const uparams = []
    if (c.roles && c.roles.length) { uparams.push(c.roles); uq += ` AND role = ANY($${uparams.length}::text[])` }
    if (c.kycNiveaux && c.kycNiveaux.length) { uparams.push(c.kycNiveaux); uq += ` AND kyc_niveau = ANY($${uparams.length}::text[])` }
    if (c.statuts && c.statuts.length) { uparams.push(c.statuts); uq += ` AND statut = ANY($${uparams.length}::text[])` }
    if (c.dateInscriptionDebut) { uparams.push(c.dateInscriptionDebut); uq += ` AND created_at >= $${uparams.length}::timestamptz` }
    if (c.dateInscriptionFin) { uparams.push(c.dateInscriptionFin); uq += ` AND created_at <= $${uparams.length}::timestamptz` }
    uq += ` ORDER BY created_at DESC LIMIT 3000`
    let users = (await pgPool.query(uq, uparams)).rows
    // Superviseur régional : restreint aux comptes de son réseau (général = pas de restriction)
    if (req.user.role === 'superviseur') {
      const reseau = await getReseauVisibleSuperviseur(req.user.id)
      if (reseau !== null) users = users.filter(u => reseau.includes(u.id))
    }
    if (!users.length) return ok(res, { utilisateurs: [], total: 0 })

    const userIds = users.map(u => u.id)
    const userById = {}
    users.forEach(u => { userById[u.id] = u })

    // 2. Nombre de filleuls (si critère demandé)
    let filleulsCountByParrain = {}
    if (c.filleulsMin !== undefined || c.filleulsMax !== undefined) {
      const rattRows = await sql(`SELECT parrain_id FROM rattachements WHERE statut = 'valide' AND parrain_id IS NOT NULL`)
      rattRows.forEach(r => {
        const pid = String(r.parrain_id)
        filleulsCountByParrain[pid] = (filleulsCountByParrain[pid] || 0) + 1
      })
    }

    // 3. Volumes de transactions (dépôt, retrait, transfert, paiement marchand envoyé/reçu) sur la période demandée
    const needVolumes = c.depotMin !== undefined || c.depotMax !== undefined
      || c.retraitMin !== undefined || c.retraitMax !== undefined
      || c.transfertMin !== undefined || c.transfertMax !== undefined
      || c.paiementEnvoyeMin !== undefined || c.paiementEnvoyeMax !== undefined
      || c.paiementRecuMin !== undefined || c.paiementRecuMax !== undefined

    let volumesByUser = {} // { userId: { depot, retrait, transfert, paiementEnvoye, paiementRecu } }
    if (needVolumes) {
      // Récupérer tous les comptes des utilisateurs ciblés pour faire le lien compte → utilisateur
      const comptes = (await pgPool.query(`SELECT id::text as id, utilisateur_id::text as "utilisateurId" FROM comptes WHERE utilisateur_id::text = ANY($1::text[])`, [userIds])).rows
      const userIdByCompte = {}
      comptes.forEach(cpt => { userIdByCompte[cpt.id] = cpt.utilisateurId })
      const compteIds = comptes.map(cpt => cpt.id)

      userIds.forEach(uid => { volumesByUser[uid] = { depot: 0, retrait: 0, transfert: 0, paiementEnvoye: 0, paiementRecu: 0 } })

      if (compteIds.length) {
        let txq = `SELECT type, montant::float as montant, compte_source_id::text as src, compte_dest_id::text as dst, date_creation FROM transactions WHERE statut = 'complete' AND (compte_source_id::text = ANY($1::text[]) OR compte_dest_id::text = ANY($1::text[]))`
        const txparams = [compteIds]
        if (c.periodeDebut) { txparams.push(c.periodeDebut); txq += ` AND date_creation >= $${txparams.length}::timestamptz` }
        if (c.periodeFin) { txparams.push(c.periodeFin); txq += ` AND date_creation <= $${txparams.length}::timestamptz` }
        const txs = (await pgPool.query(txq, txparams)).rows
        txs.forEach(tx => {
          if (tx.type === 'depot') {
            const uid = userIdByCompte[tx.dst]
            if (uid && volumesByUser[uid]) volumesByUser[uid].depot += tx.montant
          } else if (tx.type === 'retrait') {
            const uid = userIdByCompte[tx.src]
            if (uid && volumesByUser[uid]) volumesByUser[uid].retrait += tx.montant
          } else if (tx.type === 'transfert') {
            const uid = userIdByCompte[tx.src]
            if (uid && volumesByUser[uid]) volumesByUser[uid].transfert += tx.montant
          } else if (tx.type === 'paiement_marchand') {
            // Envoyé : côté client qui paie (compte_source_id). Reçu : côté business (compte_dest_id).
            const uidSrc = userIdByCompte[tx.src]
            if (uidSrc && volumesByUser[uidSrc]) volumesByUser[uidSrc].paiementEnvoye += tx.montant
            const uidDst = userIdByCompte[tx.dst]
            if (uidDst && volumesByUser[uidDst]) volumesByUser[uidDst].paiementRecu += tx.montant
          }
        })
      }
    }

    // 4. Application finale des filtres en mémoire
    const result = users.filter(u => {
      if (c.filleulsMin !== undefined && (filleulsCountByParrain[u.id] || 0) < c.filleulsMin) return false
      if (c.filleulsMax !== undefined && (filleulsCountByParrain[u.id] || 0) > c.filleulsMax) return false
      if (needVolumes) {
        const v = volumesByUser[u.id] || { depot: 0, retrait: 0, transfert: 0, paiementEnvoye: 0, paiementRecu: 0 }
        if (c.depotMin !== undefined && v.depot < c.depotMin) return false
        if (c.depotMax !== undefined && v.depot > c.depotMax) return false
        if (c.retraitMin !== undefined && v.retrait < c.retraitMin) return false
        if (c.retraitMax !== undefined && v.retrait > c.retraitMax) return false
        if (c.transfertMin !== undefined && v.transfert < c.transfertMin) return false
        if (c.transfertMax !== undefined && v.transfert > c.transfertMax) return false
        if (c.paiementEnvoyeMin !== undefined && v.paiementEnvoye < c.paiementEnvoyeMin) return false
        if (c.paiementEnvoyeMax !== undefined && v.paiementEnvoye > c.paiementEnvoyeMax) return false
        if (c.paiementRecuMin !== undefined && v.paiementRecu < c.paiementRecuMin) return false
        if (c.paiementRecuMax !== undefined && v.paiementRecu > c.paiementRecuMax) return false
      }
      return true
    }).map(u => ({
      ...u,
      nbFilleuls: filleulsCountByParrain[u.id] || 0,
      volumes: volumesByUser[u.id] || null
    })).slice(0, 1000)

    return ok(res, { utilisateurs: result, total: result.length })
  } catch (e) {
    console.error('[SEGMENTATION] ERREUR:', e.message, e.stack)
    return err(res, e.message, 500)
  }
})

// Détacher un filleul de son parrain — action réservée à backoffice (Super Back-office y compris, même rôle)
// Admin a uniquement la lecture, pas l'action.
app.post('/api/v1/admin/rattachements/detacher', authMiddleware, roleBackofficeOuSuperAdmin, async (req, res) => {
  try {
    const { filleulId } = req.body
    if (!filleulId) return err(res, 'filleulId requis', 400)
    const existing = await sql(`SELECT r.*, f.prenom, f.nom, f.telephone FROM rattachements r JOIN utilisateurs f ON f.id::text=r.filleul_id WHERE r.filleul_id = $1`, filleulId).then(r => r[0] || null)
    if (!existing) return err(res, 'Rattachement introuvable', 404)
    await pgPool.query(`DELETE FROM rattachements WHERE filleul_id = $1`, [filleulId])
    await logAction(req.user, 'detachement_rattachement', { id: filleulId, prenom: existing.prenom, nom: existing.nom, telephone: existing.telephone, role: 'client' }, `Détaché du parrain ${existing.parrain_id}`)
    return ok(res, { message: 'Filleul détaché avec succès' })
  } catch (e) { return err(res, e.message, 500) }
})

// Rattacher manuellement un filleul à un parrain — action réservée à backoffice (Super Back-office y compris)
app.post('/api/v1/admin/rattachements/rattacher', authMiddleware, roleBackofficeOuSuperAdmin, async (req, res) => {
  try {
    const { filleulId, parrainId, force } = req.body
    if (!filleulId || !parrainId) return err(res, 'filleulId et parrainId requis', 400)
    if (filleulId === parrainId) return err(res, 'Un utilisateur ne peut pas être son propre parrain', 400)

    const [filleul, parrain] = await Promise.all([
      sql(`SELECT id::text as id, prenom, nom, telephone, role, parrain_id::text as "parrainId" FROM utilisateurs WHERE id = $1`, filleulId).then(r => r[0]),
      sql(`SELECT id::text as id, prenom, nom, telephone FROM utilisateurs WHERE id = $1`, parrainId).then(r => r[0])
    ])
    if (!filleul) return err(res, 'Filleul introuvable', 404)
    if (!parrain) return err(res, 'Parrain introuvable', 404)

    // ── Vérifier si déjà rattaché à un autre parrain ──
    if (filleul.parrainId && filleul.parrainId !== parrainId && !force) {
      const ancienParrain = await sql(
        `SELECT id::text as id, prenom, nom, telephone, role FROM utilisateurs WHERE id = $1 LIMIT 1`,
        filleul.parrainId
      ).then(r => r[0])
      const nomAncien = ancienParrain
        ? `${ancienParrain.prenom || ''} ${ancienParrain.nom || ''} (${ancienParrain.telephone || ''}) — rôle: ${ancienParrain.role || ''}`
        : `ID ${filleul.parrainId}`
      return res.status(409).json({
        warning: true,
        code: 'DEJA_RATTACHE',
        message: `${filleul.prenom} ${filleul.nom} est déjà rattaché(e) à : ${nomAncien.trim()}`,
        ancienParrain: ancienParrain || null,
        filleul,
        nouveauParrain: parrain
      })
    }

    const existing = await sql(`SELECT statut FROM rattachements WHERE filleul_id = $1`, filleulId).then(r => r[0] || null)
    if (existing) {
      await pgPool.query(
        `UPDATE rattachements SET parrain_id=$1, statut='valide', date_entree=NOW(), date_sortie=NULL WHERE filleul_id=$2`,
        [parrainId, filleulId]
      )
    } else {
      await pgPool.query(
        `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at)
         VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
        [require('crypto').randomUUID(), parrainId, filleulId]
      )
    }
    await pgPool.query(`UPDATE utilisateurs SET parrain_id=$1 WHERE id=$2`, [parrainId, filleulId]).catch(()=>{})
    await logAction(req.user, 'rattachement_manuel', filleul, `Rattaché manuellement au parrain ${parrain.telephone}${force?' (forçage)':''}`)
    return ok(res, { message: `Rattachement effectué avec succès${force?' (ancien parrain remplacé)':''}` })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ ALERTES — admin, superviseur, support_tech ═══
// ══════════════════════════════════════════════
// ALERTES CENTRALISÉES — Routes complètes
// ══════════════════════════════════════════════

// Mapping service → rôles autorisés à voir
const ALERTE_SERVICE_ROLES = {
  support_client:  ['admin','backoffice','support_client'],
  support_tech:    ['admin','backoffice','support_tech'],
  superviseur:     ['admin','backoffice','superviseur'],
  backoffice:      ['admin','backoffice'],
  admin:           ['admin','backoffice'],
}

function canSeeAlerte(userRole, service) {
  if (userRole === 'admin' || userRole === 'backoffice') return true
  const allowed = ALERTE_SERVICE_ROLES[service] || ['admin']
  return allowed.includes(userRole)
}

function getServicesForRole(userRole) {
  if (userRole === 'admin' || userRole === 'backoffice') return null // all
  return Object.keys(ALERTE_SERVICE_ROLES).filter(s => ALERTE_SERVICE_ROLES[s].includes(userRole))
}

// GET /alerts — liste filtrée selon rôle
app.get('/api/v1/alerts', authMiddleware, async (req, res) => {
  try {
    const { statut, gravite, service, limit=30 } = req.query
    const userRole = req.user.role
    const services = getServicesForRole(userRole)
    let where = 'WHERE 1=1'
    const params = []
    let pi = 1
    // Toujours filtrer par les services autorisés selon le rôle
    if (services) {
      // Si un service spécifique est demandé ET qu'il est dans la liste autorisée
      if (service && services.includes(service)) {
        where += ` AND service = $${pi}`
        params.push(service); pi++
      } else {
        where += ` AND service = ANY($${pi}::text[])`
        params.push(services); pi++
      }
    } else if (service) {
      // Admin/backoffice peut filtrer par service spécifique
      where += ` AND service = $${pi}`
      params.push(service); pi++
    }
    if (statut) { where += ` AND statut = $${pi}`; params.push(statut); pi++ }
    if (gravite) { where += ` AND gravite = $${pi}`; params.push(gravite); pi++ }
    where += ` ORDER BY created_at DESC LIMIT $${pi}`
    params.push(parseInt(limit)||30)
    const list = (await pgPool.query(
      `SELECT id, titre, description, gravite, service, statut, auteur, auteur_role, traite_par, resolution, created_at::text, updated_at::text FROM alertes ${where}`,
      params
    )).rows
    // Compter les alertes ouvertes par service pour le rôle
    const servicesForCount = services || Object.keys(ALERTE_SERVICE_ROLES)
    const countsRaw = (await pgPool.query(
      `SELECT service, COUNT(*)::int as n FROM alertes WHERE statut IN ('ouverte','en_cours') AND service = ANY($1::text[]) GROUP BY service`,
      [servicesForCount]
    )).rows
    const counts = {}
    countsRaw.forEach(r => { counts[r.service] = r.n })
    return ok(res, { alertes: list, counts })
  } catch(e) { return err(res, e.message, 500) }
})

// POST /alerts — créer une alerte
app.post('/api/v1/alerts', authMiddleware, role('admin','superviseur','support_client','support_tech','backoffice'), async (req, res) => {
  try {
    const { titre, description, gravite='moyenne', service='admin' } = req.body
    if (!titre || !description) return err(res, 'titre et description requis', 400)
    const validGravites = ['faible','moyenne','elevee','critique']
    const validServices = ['support_client','support_tech','superviseur','backoffice','admin']
    const g = validGravites.includes(gravite) ? gravite : 'moyenne'
    const s = validServices.includes(service) ? service : 'admin'
    const a = await sql(
      `INSERT INTO alertes (titre, description, gravite, service, auteur, auteur_role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, titre, description, gravite, service, statut, auteur, created_at::text`,
      titre, description, g, s,
      (req.user.prenom||req.user.telephone||req.user.role),
      req.user.role
    )
    await logAction(req.user, 'alerte_creee', {id:'',prenom:'',nom:'',role:s,telephone:''},
      '['+g.toUpperCase()+'] '+titre+' — '+description.slice(0,60))
    return ok(res, a[0], 201)
  } catch(e) { return err(res, e.message, 500) }
})

// PATCH /alerts/:id — changer statut / ajouter résolution
app.patch('/api/v1/alerts/:id', authMiddleware, role('admin','superviseur','support_client','support_tech','backoffice'), async (req, res) => {
  try {
    const { statut, resolution, traite_par } = req.body
    const validStatuts = ['ouverte','en_cours','resolue','fermee']
    const updates = []
    const params = []
    let pi = 1
    if (statut && validStatuts.includes(statut)) { updates.push(`statut=$${pi}`); params.push(statut); pi++ }
    if (resolution !== undefined) { updates.push(`resolution=$${pi}`); params.push(resolution); pi++ }
    if (traite_par) { updates.push(`traite_par=$${pi}`); params.push(traite_par); pi++ }
    updates.push(`updated_at=NOW()`)
    if (!updates.length) return err(res, 'rien à modifier', 400)
    params.push(req.params.id)
    const a = await sql(
      `UPDATE alertes SET ${updates.join(',')} WHERE id=$${pi} RETURNING id, titre, statut, gravite, service, updated_at::text`,
      ...params
    )
    if (!a.length) return err(res, 'Alerte introuvable', 404)
    return ok(res, a[0])
  } catch(e) { return err(res, e.message, 500) }
})

// DELETE /alerts/:id — admin seulement
app.delete('/api/v1/alerts/:id', authMiddleware, role('admin'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM alertes WHERE id = $1", [req.params.id])
    return ok(res, { message: 'Alerte supprimée' })
  } catch(e) { return err(res, e.message, 500) }
})

// GET /alerts/counts — compteurs par service (pour badges)
app.get('/api/v1/alerts/counts', authMiddleware, async (req, res) => {
  try {
    const services = getServicesForRole(req.user.role) || Object.keys(ALERTE_SERVICE_ROLES)
    const rows = (await pgPool.query(
      `SELECT service, COUNT(*)::int as n FROM alertes WHERE statut IN ('ouverte','en_cours') AND service = ANY($1::text[]) GROUP BY service`,
      [services]
    )).rows
    const counts = {}
    rows.forEach(r => { counts[r.service] = r.n })
    return ok(res, { counts })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══════════════════════════════════════════════════════
// STATS DÉTAILLÉES — agrégation par rôle, période, direction
// GET /api/v1/stats/detailed?role=agent&period=month
// ═══════════════════════════════════════════════════════
app.get('/api/v1/stats/detailed', authMiddleware, role('admin','backoffice','superviseur','agent','mini_master','master'), async (req, res) => {
  try {
    const { role: targetRole = 'agent', period = 'month' } = req.query

    // Calcul de la date de début selon la période
    const now = new Date()
    let debut
    if (period === 'day' || period === 'today') {
      debut = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      const dow = now.getDay()
      debut = new Date(now); debut.setDate(debut.getDate() - dow); debut.setHours(0,0,0,0)
    } else if (period === 'year') {
      debut = new Date(now.getFullYear(), 0, 1)
    } else { // month (défaut)
      debut = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    const debutStr = debut.toISOString()

    // 1. Pour un agent/mini_master/master : utiliser le user connecté uniquement
    // Pour admin/backoffice/superviseur : récupérer tous les users du rôle cible
    const isSelfRole = ['agent','mini_master','master'].includes(req.user.role)
    let users
    if (isSelfRole) {
      users = await sql(
        `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.zone,
                COALESCE(c.solde,0) as solde, c.id as compte_id
         FROM utilisateurs u
         LEFT JOIN comptes c ON c.utilisateur_id = u.id
         WHERE u.id = $1 LIMIT 1`,
        toUUID(req.user.id)
      )
    } else {
      users = await sql(
        `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.zone,
                COALESCE(c.solde,0) as solde, c.id as compte_id
         FROM utilisateurs u
         LEFT JOIN comptes c ON c.utilisateur_id = u.id
         WHERE u.role = $1
         ORDER BY u.created_at DESC`,
        targetRole
      )
    }

    if (!users.length) return ok(res, { users: [], totaux: {}, courbe: [], periode: period, debut: debutStr })

    // Forcer les IDs en strings pures (Prisma peut retourner des objets)
    users.forEach(u => {
      u.id = String(u.id || '')
      u.compte_id = u.compte_id ? String(u.compte_id) : null
    })
    const compteIds = users.map(u => u.compte_id).filter(Boolean)
    const userByCompte = {}
    users.forEach(u => { if (u.compte_id) userByCompte[u.compte_id] = u.id })

    // 2. Requête transactions sur la période selon la logique métier par rôle
    let txSQL = ''
    let txParams = [debutStr]

    if (targetRole === 'agent') {
      // Agents : dépôts (compte_source_id = compte agent), retraits (compte_dest_id = compte agent), transferts (source OU dest)
      // Note : la colonne agent_id n'est jamais renseignée à l'insertion des transactions — on se base sur les comptes.
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as "compteSourceId", t.compte_dest_id as "compteDestId",
               t.initiateur_id as "initiateurId",
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND t.type IN ('depot','retrait','transfert')
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'business') {
      // Business : paiements reçus (compteDestId), transferts envoyés/reçus, paiements entre business
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as "compteSourceId", t.compte_dest_id as "compteDestId",
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
          AND t.type IN ('paiement_marchand','transfert')
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'mini_master' || targetRole === 'master') {
      // Mini-Master/Master : tous les transferts (source/dest) + commissions reçues
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as "compteSourceId", t.compte_dest_id as "compteDestId",
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
          AND t.type IN ('transfert','depot','retrait')
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'client') {
      // Clients : dépôts reçus, retraits, transferts, paiements marchands
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as "compteSourceId", t.compte_dest_id as "compteDestId",
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else {
      return ok(res, { users: [], totaux: {}, courbe: [] })
    }

    const txns = await sql(txSQL, ...txParams)

    // 3. Calculer les stats par utilisateur avec distinction envoyé/reçu
    const userStats = {}
    users.forEach(u => {
      userStats[u.id] = {
        depot_effectue:    { n: 0, vol: 0 },  // agent fait dépôt pour client
        retrait_effectue:  { n: 0, vol: 0 },  // agent fait retrait pour client
        transfert_envoye:  { n: 0, vol: 0 },
        transfert_recu:    { n: 0, vol: 0 },
        paiement_recu:     { n: 0, vol: 0 },  // business reçoit paiement
        paiement_envoye:   { n: 0, vol: 0 },  // client fait paiement
        depot_recu:        { n: 0, vol: 0 },  // client reçoit dépôt
        retrait_fait:      { n: 0, vol: 0 },  // client fait retrait
        comm_gagnee:       { n: 0, vol: 0 },
      }
    })

    const compteSetSource = new Set(compteIds)
    txns.forEach(tx => {
      // Forcer string pour les UUIDs (Prisma peut retourner Buffer)
      tx.compteSourceId = tx.compteSourceId ? String(tx.compteSourceId) : null
      tx.compteDestId   = tx.compteDestId   ? String(tx.compteDestId)   : null
      tx.agentId        = tx.agentId        ? String(tx.agentId)        : null
      const m = Number(tx.montant || 0)
      const f = Number(tx.frais || 0)
      const isSource = compteSetSource.has(tx.compteSourceId)
      const isDest = compteSetSource.has(tx.compteDestId)
      const srcUserId = userByCompte[tx.compteSourceId]
      const destUserId = userByCompte[tx.compteDestId]

      if (targetRole === 'agent') {
        // Dépôt : l'agent est la source (il transfère depuis son compte vers le client)
        // Retrait : l'agent est la destination (il reçoit l'argent du client qui retire)
        if (tx.type === 'depot' && srcUserId && userStats[srcUserId]) {
          userStats[srcUserId].depot_effectue.n++
          userStats[srcUserId].depot_effectue.vol += m
        } else if (tx.type === 'retrait' && destUserId && userStats[destUserId]) {
          userStats[destUserId].retrait_effectue.n++
          userStats[destUserId].retrait_effectue.vol += m
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        }
      } else if (targetRole === 'business') {
        if (tx.type === 'paiement_marchand') {
          if (isDest && destUserId && userStats[destUserId]) {
            userStats[destUserId].paiement_recu.n++
            userStats[destUserId].paiement_recu.vol += m
          }
          if (isSource && srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].paiement_envoye.n++
            userStats[srcUserId].paiement_envoye.vol += m
          }
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        }
      } else if (targetRole === 'mini_master' || targetRole === 'master') {
        if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        } else if (tx.type === 'depot') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].depot_effectue.n++
            userStats[srcUserId].depot_effectue.vol += m
          }
        } else if (tx.type === 'retrait') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].retrait_effectue.n++
            userStats[srcUserId].retrait_effectue.vol += m
          }
        }
      } else if (targetRole === 'client') {
        if (tx.type === 'depot' && isDest && destUserId && userStats[destUserId]) {
          userStats[destUserId].depot_recu.n++
          userStats[destUserId].depot_recu.vol += m
        } else if (tx.type === 'retrait' && isSource && srcUserId && userStats[srcUserId]) {
          userStats[srcUserId].retrait_fait.n++
          userStats[srcUserId].retrait_fait.vol += m
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        } else if (tx.type === 'paiement_marchand' && isSource && srcUserId && userStats[srcUserId]) {
          userStats[srcUserId].paiement_envoye.n++
          userStats[srcUserId].paiement_envoye.vol += m
        }
      }
    })

    // 4. Totaux globaux
    const totaux = {
      depot_effectue:   { n: 0, vol: 0 },
      retrait_effectue: { n: 0, vol: 0 },
      transfert_envoye: { n: 0, vol: 0 },
      transfert_recu:   { n: 0, vol: 0 },
      paiement_recu:    { n: 0, vol: 0 },
      paiement_envoye:  { n: 0, vol: 0 },
      depot_recu:       { n: 0, vol: 0 },
      retrait_fait:     { n: 0, vol: 0 },
    }
    Object.values(userStats).forEach(st => {
      Object.keys(totaux).forEach(k => {
        if (st[k]) { totaux[k].n += st[k].n; totaux[k].vol += st[k].vol }
      })
    })

    // 5. Courbe temporelle (pour le graphique)
    // Agrégation par jour/semaine/mois selon la période
    const courbeMap = {}
    txns.forEach(tx => {
      const d = new Date(tx.date_creation)
      let key
      if (period === 'day' || period === 'today') key = d.getHours() + 'h'
      else if (period === 'week') key = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })
      else if (period === 'year') key = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()]
      else key = d.getDate().toString() // month → jours

      if (!courbeMap[key]) courbeMap[key] = {}
      const m = Number(tx.montant || 0)
      if (tx.type === 'depot') {
        const cat = targetRole === 'client' ? 'depot_recu' : 'depot_effectue'
        courbeMap[key][cat] = (courbeMap[key][cat] || 0) + m
      } else if (tx.type === 'retrait') {
        const cat = targetRole === 'client' ? 'retrait_fait' : 'retrait_effectue'
        courbeMap[key][cat] = (courbeMap[key][cat] || 0) + m
      } else if (tx.type === 'paiement_marchand') {
        // Envoyé : compte source dans l'ensemble ciblé. Reçu : compte dest dans l'ensemble ciblé.
        // Un même paiement peut alimenter les deux si source ET dest appartiennent tous deux au rôle ciblé.
        if (compteSetSource.has(tx.compteSourceId)) courbeMap[key]['paiement_envoye'] = (courbeMap[key]['paiement_envoye'] || 0) + m
        if (compteSetSource.has(tx.compteDestId)) courbeMap[key]['paiement_recu'] = (courbeMap[key]['paiement_recu'] || 0) + m
      } else if (tx.type === 'transfert') {
        if (compteSetSource.has(tx.compteSourceId)) courbeMap[key]['transfert_envoye'] = (courbeMap[key]['transfert_envoye'] || 0) + m
        if (compteSetSource.has(tx.compteDestId)) courbeMap[key]['transfert_recu'] = (courbeMap[key]['transfert_recu'] || 0) + m
      }
    })

    // Construire labels ordonnés
    const courbe = Object.entries(courbeMap).map(([label, vals]) => ({ label, ...vals }))

    // 6. Enrichir users avec leurs stats
    const usersEnriched = users.map(u => ({
      ...u,
      stats: userStats[u.id] || {}
    }))

    return ok(res, {
      users: usersEnriched,
      totaux,
      courbe,
      periode: period,
      role: targetRole,
      debut: debutStr,
      total_users: users.length,
      total_actifs: users.filter(u => u.statut === 'actif').length
    })
  } catch(e) { return err(res, e.message, 500) }
})

// ══════════════════════════════════════════════
// ANCIEN SYSTÈME alertes_fraude (conservé pour compatibilité)
app.patch('/api/v1/alerts-fraude/:id', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try {
    const afBody = req.body
    const afSets = Object.keys(afBody).map((k,i) => `${k}=$${i+1}`).join(',')
    const afVals = [...Object.values(afBody), req.params.id]
    const afRows = await sql(`UPDATE alertes_fraude SET ${afSets} WHERE id=$${afVals.length} RETURNING *`, ...afVals)
    return ok(res, afRows[0] || {})
  } catch(e){return err(res,e.message,500)}
})

// ═══ COMMISSIONS — liste des commissions d'un utilisateur ═══
app.get('/api/v1/commissions', authMiddleware, async (req, res) => {
  try {
    const { type, userId, limit=50 } = req.query
    const targetId = userId || toUUID(req.user.id)
    if (!['admin','superviseur','support_client','support_tech'].includes(req.user.role) && targetId !== toUUID(req.user.id)) {
      return err(res, 'Accès refusé', 403)
    }
    const toUUID_c = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const targetIdStr = toUUID_c(targetId === toUUID(req.user.id) ? toUUID(req.user.id) : targetId)
    let sqlQuery = `SELECT * FROM commissions WHERE beneficiaire_id = $1`
    const params = [targetId]
    if (type) { sqlQuery += ` AND type_commission = $${params.length+1}`; params.push(type) }
    sqlQuery += ` ORDER BY date_calcul DESC LIMIT $${params.length+1}`; params.push(Number(limit))
    const comms = await sql(sqlQuery, ...params)
    return ok(res, comms)
  } catch(e) { return err(res, e.message, 500) }
})


// ═══ VIREMENT GAINS → COMPTE PRINCIPAL ═══
// ═══ VIREMENT COMMISSIONS (dépôt/retrait) → COMPTE PRINCIPAL ═══
app.post('/api/v1/accounts/transfer-commissions', authMiddleware, async (req, res) => {
  try {
    const { montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')
    const uid = toUUID(req.user.id)
    // Toutes les commissions disponibles (journalière + réseau + parrainage), statut='verse'
    const rows = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id=$1 AND statut='verse'`,
      uid
    )
    const disponible = Number(rows[0]?.total || 0)
    if (amt > disponible) return err(res, `Commissions insuffisantes (${disponible} disponibles)`)
    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, uid)
    const compteId = compteRows[0]?.id
    if (!compteId) return err(res, 'Compte introuvable')
    // Créditer le solde pour le montant total viré
    // (commission_journaliere + réseau + parrainage : tous en verse, aucun déjà crédité)
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text=$2`, [amt, compteId])
    // Marquer toutes les commissions virées (dans la limite du montant demandé)
    const commToVire = await sql(
      `SELECT id, montant::float as montant FROM commissions WHERE beneficiaire_id=$1 AND statut='verse' ORDER BY date_calcul ASC`,
      uid
    )
    let reste = amt
    for (const c of commToVire) {
      if (reste <= 0) break
      const cm = Number(c.montant)
      if (cm <= reste) {
        await pgPool.query(`UPDATE commissions SET statut='vire' WHERE id=$1`, [c.id])
        reste -= cm
      } else {
        await pgPool.query(`UPDATE commissions SET montant=montant-$1 WHERE id=$2`, [reste, c.id])
        reste = 0
      }
    }
    const txId = require('crypto').randomUUID()
    const ref = 'VRC-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'virement_commission','complete',$3,$4,$5,0,$6,NOW())`,
      [txId, ref, compteId, compteId, amt, uid]
    ).catch(()=>{})
    return ok(res, { message: `Virement de ${amt} effectué`, montant: amt, reference: ref, nouveauSolde: disponible - amt })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ VIREMENT GAINS PARRAINAGE → COMPTE PRINCIPAL ═══
// ═══ VIREMENT ManiPay → compte externe (banque, mobile money...) ═══
app.post('/api/v1/admin/manipay/virer', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const { montant, description } = req.body
    const amt = Number(montant)
    if (!amt || amt <= 0) return err(res, 'Montant invalide')
    if (!isSuperAdminUser(req.user)) return err(res, 'Réservé au Super Back-office', 403)

    // Vérifier que le résultat net ManiPay couvre le montant
    const gains = await sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id = $1`, MANI_PAY_USER_ID)
    const charges = await sql(`
      SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
      WHERE type_commission IN ('commission_journaliere','parrainage','commission_parrain','reseau_mini_master_retrait','reseau_mini_master_paiement','reseau_master_retrait','reseau_master_paiement','reseau_master_retrait_mm','reseau_master_paiement_mm')
        AND beneficiaire_id::text != $1
    `, MANI_PAY_USER_ID)
    const dejaVires = await sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM transactions WHERE type='virement_manipay' AND statut='complete'`)
    const netDisp = Math.max(0, (gains[0]?.total||0) - (charges[0]?.total||0) - (dejaVires[0]?.total||0))

    if (amt > netDisp) return err(res, `Résultat net insuffisant (${netDisp.toLocaleString('fr-FR')} disponible). Les gains sont déjà dans votre solde personnel.`)

    // Enregistrement comptable uniquement — les gains sont déjà crédités au compte personnel
    // via crediterManiPay() à chaque retrait/paiement. Pas de mouvement de fonds supplémentaire.
    const txId = require('crypto').randomUUID()
    const ref = 'VIRMANI-' + Date.now().toString(36).toUpperCase()
    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id::text=$1 LIMIT 1`, toUUID(req.user.id))
    const compteId = compteRows[0]?.id

    await pgPool.query(
      `INSERT INTO transactions (id, reference, type, statut, compte_source_id, compte_dest_id, montant, frais, description, initiateur_id, date_creation)
       VALUES ($1,$2,'virement_manipay','complete',$3,$3,$4,0,$5,$6,NOW())`,
      [txId, ref, compteId, amt, description || 'Virement ManiPay → Compte personnel', toUUID(req.user.id)]
    ).catch(()=>{})

    return ok(res, { id: txId, reference: ref, montant: amt, message: 'Virement enregistré. Les fonds sont déjà dans votre solde personnel.' })
  } catch(e) { return err(res, e.message, 500) }
})

app.post('/api/v1/accounts/transfer-gains', authMiddleware, async (req, res) => {
  try {
    const { montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')
    const uid = toUUID(req.user.id)
    // Tous les gains virables = statut verse (parrainage + réseau), pas en_attente
    const rows = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
       WHERE beneficiaire_id=$1 AND statut='verse'
         AND type_commission IN ('parrainage','commission_parrain','reseau_mini_master_retrait','reseau_mini_master_paiement','reseau_master_retrait','reseau_master_paiement','reseau_master_retrait_mm','reseau_master_paiement_mm')`,
      uid
    )
    const disponible = Number(rows[0]?.total || 0)
    if (amt > disponible) return err(res, `Gains insuffisants (${disponible} disponibles)`)
    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, uid)
    const compteId = compteRows[0]?.id
    if (!compteId) return err(res, 'Compte introuvable')
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id::text=$2`, [amt, compteId])
    const gainsToVire = await sql(
      `SELECT id, montant::float as montant FROM commissions
       WHERE beneficiaire_id=$1 AND statut='verse'
         AND type_commission IN ('parrainage','commission_parrain','reseau_mini_master_retrait','reseau_mini_master_paiement','reseau_master_retrait','reseau_master_paiement','reseau_master_retrait_mm','reseau_master_paiement_mm')
       ORDER BY date_calcul ASC`,
      uid
    )
    let resteG = amt
    for (const g of gainsToVire) {
      if (resteG <= 0) break
      const gm = Number(g.montant)
      if (gm <= resteG) {
        await pgPool.query(`UPDATE commissions SET statut='vire' WHERE id=$1`, [g.id])
        resteG -= gm
      } else {
        await pgPool.query(`UPDATE commissions SET montant=montant-$1 WHERE id=$2`, [resteG, g.id])
        resteG = 0
      }
    }
    // Enregistrer le virement dans transactions
    const txId2 = require('crypto').randomUUID()
    const ref2 = 'VRG-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'virement_gains','complete',$3,$4,$5,0,$6,NOW())`,
      [txId2, ref2, compteId, compteId, amt, uid]
    ).catch(()=>{})
    return ok(res, { message: `Virement de ${amt} effectué`, montant: amt, reference: ref2, nouveauSolde: disponible - amt })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ TICKETS — admin, superviseur, support_client, support_tech ═══
app.get('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {statut, limit=50, service} = req.query
    const canSeeAll = BACKOFFICE.includes(req.user.role)
    let where = canSeeAll ? {} : {clientId:toUUID(req.user.id)}
    // Utiliser queryRaw pour éviter le cast enum StatutTicket
    const tkConditions = []
    const tkParams = []
    let tkIdx = 1
    if (!canSeeAll) { tkConditions.push(`t.client_id = $${tkIdx}`); tkParams.push(where.clientId); tkIdx++ }
    if (statut) { tkConditions.push(`t.statut = $${tkIdx}`); tkParams.push(statut); tkIdx++ }
    if (service) { tkConditions.push(`t.service = $${tkIdx}`); tkParams.push(service); tkIdx++ }
    const tkWhere = tkConditions.length > 0 ? 'WHERE ' + tkConditions.join(' AND ') : ''
    const tkLimit = parseInt(limit) || 50
    const list = await sql(
      `SELECT t.id, t.reference, t.sujet, t.description, t.statut, t.priorite, t.service, t.date_creation as date_creation, t.date_resolution as "dateResolution", u.prenom, u.nom, u.telephone FROM tickets_support t LEFT JOIN utilisateurs u ON u.id = t.client_id ${tkWhere} ORDER BY t.date_creation DESC LIMIT ${tkLimit}`,
      ...tkParams
    )
    return ok(res, list)
  } catch(e){return err(res,e.message,500)}
})

// Supprimer un ticket
app.delete('/api/v1/tickets/:id', authMiddleware, role('admin'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM tickets_support WHERE id = $1", [req.params.id])
    return ok(res, {message:'Ticket supprimé'})
  } catch(e){return err(res,e.message,500)}
})

app.post('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {sujet, description, service, telephone, priorite} = req.body
    // Si support crée un ticket pour un client
    let clientId = toUUID(req.user.id)
    if (BACKOFFICE.includes(req.user.role) && telephone) {
      const tktClientRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE telephone=$1 LIMIT 1`, telephone)
      if (tktClientRows[0]) clientId = tktClientRows[0].id
    }
    // Service: utiliser la valeur fournie, sinon déduire selon le rôle
    const validServices = ['support_client', 'support_tech', 'backoffice', 'admin', 'superviseur']
    const svc = (service && validServices.includes(service)) ? service : (
      req.user.role === 'support_tech' ? 'support_tech' :
      req.user.role === 'support_client' ? 'support_client' :
      req.user.role === 'admin' || req.user.role === 'superviseur' ? 'admin' : 'backoffice'
    )
    const ref_t = 'TKT-' + Date.now().toString(36).toUpperCase()
    const ticketData = {
      sujet, description,
      statut: 'ouvert',
      clientId,
      service: svc,
      reference: ref_t
    }
    if (priorite) ticketData.priorite = priorite
    // Utiliser SQL brut pour éviter les contraintes d'enum Prisma sur priorite
    const prio = priorite || 'normal'
    const t = await sql(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, client_id, service, priorite, date_creation)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'ouvert', $4, $5, $6, NOW())
       RETURNING id::text, reference, sujet, description, statut, service, priorite, date_creation::text as date_creation`,
      ref_t, sujet, description, clientId, svc, prio
    )
    await logAction(req.user, 'ticket_cree', {id:String(clientId||''),prenom:'',nom:'',role:svc,telephone:''},
      '['+prio.toUpperCase()+'] '+sujet+' — '+description.slice(0,60))
    return ok(res, t[0], 201)
  } catch(e){return err(res,e.message,500)}
})

// Mettre à jour statut ticket — admin, superviseur, support_client, support_tech
app.patch('/api/v1/tickets/:id/status', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { statut } = req.body
    const validStatuts = ['ouvert','en_cours','escalade','resolu','ferme','rejete']
    if (!validStatuts.includes(statut)) return err(res, 'Statut invalide')
    // SQL brut pour éviter que Prisma recharge le champ priorite (enum incompatible)
    const rows = await sql(
      `UPDATE tickets_support SET statut = $1
       WHERE id = $2
       RETURNING id::text, reference, sujet, statut, service, priorite, client_id::text as "clientId", date_creation::text as date_creation`,
      statut, req.params.id
    )
    if (!rows.length) return err(res, 'Ticket introuvable', 404)
    const t = rows[0]
    if (t.clientId && ['resolu','ferme','rejete'].includes(statut)) {
      const msgs = {
        resolu: ['✅ Ticket résolu',   'Votre demande de support a été résolue.'],
        ferme:  ['🔒 Ticket clôturé', 'Votre ticket a été clôturé.'],
        rejete: ['❌ Ticket rejeté',   "Votre demande n'a pu être traitée."]
      }
      const [titre, msg] = msgs[statut]
      await notifier(t.clientId, 'systeme', titre, msg, {ticketId: t.id})
    }
    return ok(res, t)
  } catch(e){ return err(res, e.message, 500) }
})

// Ajouter commentaire/note à un ticket
app.post('/api/v1/tickets/:id/note', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { note } = req.body
    if (!note) return err(res, 'note requise')
    await pgPool.query(
      `UPDATE tickets_support SET description = $1 WHERE id = $2`,
      [note, req.params.id]
    )
    return ok(res, { id: req.params.id, description: note })
  } catch(e){ return err(res,e.message,500) }
})

// ═══ RÉSEAU ═══
app.get('/api/v1/network/agents', authMiddleware, async (req, res) => {
  try {
    const agents = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.zone, u.statut, u.code_parrainage as "codeParrainage",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id
       WHERE u.parrain_id=$1 AND u.role='agent' GROUP BY u.id`, toUUID(req.user.id)
    )
    return ok(res,agents)
  } catch(e){return err(res,e.message,500)}
})

// ═══ KYC DOCUMENTS — support_client peut voir les photos ═══

// Enregistrer URL document KYC après upload Cloudinary
app.post('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier, hashFichier } = req.body
    if (!userId || !typeDocument || !urlFichier) return err(res, 'userId, typeDocument et urlFichier requis')
    // S'assurer que la table et ses colonnes existent (migration défensive)
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type_document TEXT NOT NULL,
        url_fichier TEXT NOT NULL,
        hash_fichier TEXT DEFAULT 'none',
        statut TEXT NOT NULL DEFAULT 'soumis',
        commentaire TEXT,
        verifie_par TEXT,
        date_soumission TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        date_verification TIMESTAMP
      )
    `).catch(()=>{})
    // Ajouter les colonnes manquantes si la table existait déjà sans elles
    const migCols = [
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS hash_fichier TEXT DEFAULT 'none'`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'soumis'`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_soumission TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS commentaire TEXT`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verifie_par TEXT`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_verification TIMESTAMP`,
    ]
    for (const sqlCol of migCols) {
      await pgPool.query(sqlCol).catch(()=>{})
    }
    const id = require('crypto').randomUUID()
    // Supprimer l'ancien doc du même type pour ce user (remplacement)
    await pgPool.query(
      `DELETE FROM kyc_documents WHERE utilisateur_id = $1 AND type_document = $2`,
      [userId, typeDocument]
    ).catch(()=>{})
    // Détecter les colonnes disponibles pour un INSERT adapté
    let insertOk = false
    // Tentative 1 : INSERT complet avec toutes les colonnes
    try {
      await pgPool.query(
        `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut, date_soumission, created_at)
         VALUES ($1, $2, $3, $4, $5, 'soumis', NOW(), NOW())`,
        [id, userId, typeDocument, urlFichier, hashFichier||'none']
      )
      insertOk = true
    } catch(e1) {
      // Tentative 2 : sans date_soumission/created_at
      try {
        await pgPool.query(
          `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut)
           VALUES ($1, $2, $3, $4, $5, 'soumis')`,
          [id, userId, typeDocument, urlFichier, hashFichier||'none']
        )
        insertOk = true
      } catch(e2) {
        // Tentative 3 : sans hash_fichier
        try {
          await pgPool.query(
            `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, statut)
             VALUES ($1, $2, $3, $4, 'soumis')`,
            [id, userId, typeDocument, urlFichier]
          )
          insertOk = true
        } catch(e3) {
          // Tentative 4 : minimal absolu
          await pgPool.query(
            `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier)
             VALUES ($1, $2, $3, $4)`,
            [id, userId, typeDocument, urlFichier]
          )
          insertOk = true
        }
      }
    }
    return ok(res, { id, utilisateurId: userId, typeDocument, urlFichier, statut: 'soumis' }, 201)
  } catch(e) { return err(res, e.message, 500) }
})

app.get('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, type } = req.query
    // Un client ne peut voir que ses propres documents
    const targetId = BACKOFFICE.includes(req.user.role) ? (userId || toUUID(req.user.id)) : toUUID(req.user.id)
    let query = `SELECT id, type_document as "typeDocument", url_fichier as "urlFichier", statut, COALESCE(date_soumission, created_at) as "dateSoumission" FROM kyc_documents WHERE utilisateur_id = $1`
    const params = [targetId]
    if (type) { query += ` AND type_document = $2`; params.push(type) }
    query += ` ORDER BY COALESCE(date_soumission, created_at) DESC`
    const docs = await sql(query, ...params)
    return ok(res, docs)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC REQUEST — client soumet une demande de montée de niveau ═══
app.post('/api/v1/kyc/request', authMiddleware, async (req, res) => {
  try {
    const { userId, niveauDemande } = req.body
    const targetId = userId || toUUID(req.user.id)
    // SQL brut — évite le cast enum Prisma sur kyc_niveau
    const userRows = await sql(
      `SELECT id::text as id, kyc_niveau as "kycNiveau", statut FROM utilisateurs WHERE id = $1 LIMIT 1`,
      targetId
    )
    if (!userRows.length) return err(res, 'Utilisateur introuvable', 404)
    const user = userRows[0]
    // Passer statut → en_attente et mémoriser le niveau demandé (tout en SQL brut)
    await pgPool.query(
      `UPDATE utilisateurs SET statut = 'en_attente', kyc_niveau_demande = $1, updated_at = NOW() WHERE id = $2`,
      [niveauDemande, targetId]
    )
    // Créer un ticket automatique pour le back-office
    const ref = 'KYC-' + Date.now().toString(36).toUpperCase()
    const ticketId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES ($1, $2, $3, $4, 'ouvert', 'support_client', 'normal', $5, NOW())`,
      [ticketId, ref,
      'Demande upgrade KYC → ' + niveauDemande,
      'Le client a soumis ses documents pour passer au niveau ' + niveauDemande + '. Niveau actuel : ' + (user.kycNiveau||'aucun') + '. Photos disponibles dans la fiche client. Veuillez vérifier et valider sous 48h.',
      targetId]
    ).catch(e => console.warn('ticket kyc:', e.message))
    await notifier(targetId, 'kyc', '⏳ Dossier KYC soumis',
      `Votre dossier ${niveauDemande} a été soumis. Validation sous 48h.`,
      { niveauDemande }
    )
    return ok(res, { message: 'Demande soumise — en attente de validation (48h)', reference: ref, statut: 'en_attente' })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC — admin et superviseur valident ═══
app.get('/api/v1/kyc/:userId/validate', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try {
    // SQL brut — évite cast enum Prisma sur kyc_niveau
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau=$1, statut='actif', kyc_niveau_demande=NULL, updated_at=NOW() WHERE id = $2`,
      [req.body.kycNiveau||'KYC1', req.params.userId]
    )
    await notifier(req.params.userId, 'kyc', '✅ KYC validé',
      `Félicitations ! Votre dossier a été validé. Votre nouveau plafond est actif.`,
      {}
    )
    return ok(res, { id: req.params.userId, kycNiveau: req.body.kycNiveau, statut: 'actif' })
  } catch(e){return err(res,e.message,500)}
})

// PATCH /kyc/:id/reject — rejeter une demande KYC
app.patch('/api/v1/kyc/:userId/reject', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { raison } = req.body
    // Effacer la demande en attente
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau_demande = NULL WHERE id = $1`,
      [req.params.userId]
    )
    // Créer un ticket d'information pour le client
    const ref = 'KYC-REJ-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES (gen_random_uuid(), $1, 'Documents KYC rejetés', $2, 'ferme', 'support_client', 'normal', $3, NOW())`,
      [ref, 'Vos documents ont été rejetés. Raison : ' + (raison || 'Documents non conformes') + '. Veuillez soumettre à nouveau des documents lisibles et valides.', req.params.userId]
    ).catch(() => {})
    // Notification rejet KYC avec motif
    await notifier(req.params.userId, 'kyc', '❌ Documents KYC refusés',
      (raison || 'Documents non conformes. Veuillez soumettre de nouveaux documents lisibles et valides.') + '',
      { raison: raison || null, action: 'resoumettre' }
    )
    return ok(res, { message: 'Demande rejetée', raison })
  } catch(e) { return err(res, e.message, 500) }
})

// Route diagnostic — trouver les vrais noms des enums PostgreSQL
app.get('/api/v1/debug/enums', async (req, res) => {
  try {
    const enums = await sql(`SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname`)
    return ok(res, enums)
  } catch(e) { return err(res, e.message) }
})

// PATCH /users/:id/kyc — valider le niveau KYC (support_client + admin)
app.patch('/api/v1/users/:id/kyc', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { kycNiveau } = req.body
    if (!kycNiveau) return err(res, 'kycNiveau requis')
    const kycValide = ['KYC1','KYC2','KYC3'].includes(kycNiveau) ? kycNiveau : 'KYC1'
    // Vérifier si kyc_niveau est un enum ou un text
    const colInfo = await sql(
      `SELECT data_type FROM information_schema.columns WHERE table_name='utilisateurs' AND column_name='kyc_niveau' LIMIT 1`
    )
    // Toujours SQL brut — kyc_niveau est TEXT en base (pas enum)
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau=$1, statut='actif', updated_at=NOW() WHERE id = $2`,
      [kycValide, req.params.id]
    )
    // Étape 3 : colonnes optionnelles (silencieux si inexistantes)
    await pgPool.query(`UPDATE utilisateurs SET kyc_niveau_demande = NULL WHERE id = $1`, [req.params.id]).catch(()=>{})
    await pgPool.query(`UPDATE utilisateurs SET kyc_valide_le = NOW() WHERE id = $1`, [req.params.id]).catch(()=>{})
    // Étape 4 : plafond compte
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const plafond = plafonds[kycValide]
    if (plafond) {
      await pgPool.query(`UPDATE comptes SET plafond_mensuel = $1 WHERE utilisateur_id::text = $2`, [plafond, String(req.params.id)]).catch(()=>{})
    }
    // Notification
    await notifier(req.params.id, 'kyc', '✅ KYC validé', `Félicitations ! Votre compte est maintenant actif au niveau ${kycValide}.`, {}).catch(()=>{})
    return ok(res, { id: req.params.id, kycNiveau: kycValide, statut: 'actif' })
  } catch(e) {
    console.error('❌ PATCH /users/:id/kyc ERROR:', e.message)
    return err(res, e.message, 500)
  }
})

// ═══ DÉMARRAGE ═══
async function main() {
  try {
    // Connexion pgPool d'abord (plus fiable que Prisma sur Render cold start)
    await pgPool.query('SELECT 1')
    console.log('✅ pgPool connecté')
    try {
      await prisma.$connect()
      console.log('✅ Prisma connecté')
    } catch(pe) {
      console.warn('⚠️ Prisma connect warning (non-fatal):', pe.message)
    }

    // ── TABLE NOTIFICATIONS — créée en priorité ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notifications init:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    console.log('✅ Table notifications prête')

    // ── TABLE CAMPAGNES NOTIFICATIONS — historique centralisé ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notif_campagnes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'systeme',
        cible TEXT NOT NULL,
        nb_destinataires INTEGER DEFAULT 0,
        envoye_par TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notif_campagnes init:', e.message))
    console.log('✅ Table notif_campagnes prête')

    // Créer les tables manquantes si elles n'existent pas
    // Ajouter colonne initiateur_role si manquante
    await pgPool.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS initiateur_role TEXT NOT NULL DEFAULT 'client'
    `).catch(e => console.log('initiateur_role:', e.message))

    // Ajouter colonne kyc_niveau_demande pour suivre les demandes en attente
    await pgPool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_niveau_demande TEXT DEFAULT NULL
    `).catch(e => console.log('kyc_niveau_demande:', e.message))

    // Ajouter colonne kyc_valide_le pour suivre la date de validation KYC
    await pgPool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_valide_le TIMESTAMP DEFAULT NULL
    `).catch(e => console.log('kyc_valide_le:', e.message))

    // Table rattachements : filleuls ayant rempli les 2 conditions
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS rattachements (
        id TEXT PRIMARY KEY,
        parrain_id TEXT NOT NULL,
        filleul_id TEXT NOT NULL UNIQUE,
        date_entree TIMESTAMP,
        date_sortie TIMESTAMP,
        statut TEXT DEFAULT 'en_cours',
        created_at TIMESTAMP DEFAULT NOW(),
        verifie_remboursement BOOLEAN DEFAULT FALSE,
        CONSTRAINT fk_parrain FOREIGN KEY (parrain_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        CONSTRAINT fk_filleul FOREIGN KEY (filleul_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
      )
    `).catch(e => console.log('rattachements:', e.message))
    // Ajout colonne pour les tables déjà existantes (créées avant cette mise à jour)
    await pgPool.query(`ALTER TABLE rattachements ADD COLUMN IF NOT EXISTS verifie_remboursement BOOLEAN DEFAULT FALSE`).catch(()=>{})

    // Table superviseur_masters : affectation d'un ou plusieurs Masters à un superviseur.
    // Le type (général ou régional) est désormais un statut EXPLICITE (colonne superviseur_type
    // sur utilisateurs), pas déduit du nombre de Masters assignés — un régional peut très bien
    // gérer plusieurs zones/Masters (plusieurs lignes ici), tout comme un général qui gère tout.
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS superviseur_masters (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        superviseur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        master_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(superviseur_id, master_id)
      )
    `).catch(e => console.log('superviseur_masters:', e.message))
    await pgPool.query(`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS superviseur_type TEXT DEFAULT 'general'`).catch(()=>{})

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        type_document TEXT NOT NULL,
        url_fichier TEXT NOT NULL,
        hash_fichier TEXT NOT NULL DEFAULT 'none',
        statut TEXT NOT NULL DEFAULT 'soumis',
        commentaire TEXT,
        verifie_par TEXT,
        date_soumission TIMESTAMP DEFAULT NOW(),
        date_verification TIMESTAMP
      )
    `)
    console.log('✅ Table kyc_documents OK')

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS tickets_support (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        reference TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL REFERENCES utilisateurs(id),
        transaction_id TEXT,
        sujet TEXT NOT NULL,
        description TEXT NOT NULL,
        priorite TEXT NOT NULL DEFAULT 'moyenne',
        statut TEXT NOT NULL DEFAULT 'ouvert',
        assigne_a TEXT,
        escalade_a TEXT,
        sla_expiration TIMESTAMP,
        date_creation TIMESTAMP DEFAULT NOW(),
        date_resolution TIMESTAMP
      )
    `)
    console.log('✅ Table tickets_support OK')

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes_fraude (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        type_alerte TEXT NOT NULL,
        niveau TEXT NOT NULL DEFAULT 'info',
        utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
        transaction_id TEXT,
        description TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'active',
        detecte_par TEXT NOT NULL DEFAULT 'systeme',
        traite_par TEXT,
        action_prise TEXT,
        date_detection TIMESTAMP DEFAULT NOW(),
        date_traitement TIMESTAMP
      )
    `)
    console.log('✅ Table alertes_fraude OK')

    // ── TABLE ALERTES CENTRALISÉES ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `).catch(e => console.log('alertes init:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)
    `).catch(()=>{})
    console.log('✅ Table alertes centralisées prête')

    // Table notifications
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notifications:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(() => {})
    console.log('✅ Table notifications OK')

  } catch (e) {
    console.error('❌ Erreur DB (non-fatal):', e.message)
    // Ne pas crasher — le serveur reste UP, les routes SQL directes fonctionnent
  }
} // ← FIN de main()


// Route pour créer/vérifier la table notifications (utile si main() n a pas eu le temps)
app.post('/api/v1/admin/setup-notifications', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    return ok(res, { message: 'Table notifications prête' })
  } catch(e) { return err(res, e.message, 500) }
})

// ── ROUTES NOTIFICATIONS ──────────────────────────────────────────────

// Lister les notifications de l'utilisateur connecté
// Route debug auth — voir ce que retourne toUUID(req.user.id) exactement
// Route compteur notifications non lues
app.get('/api/v1/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const rows = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1 AND lu=false",
      toUUID(req.user.id)
    )
    return ok(res, { count: rows[0]?.n || 0 })
  } catch(e) { return ok(res, { count: 0 }) }
})

app.get('/api/v1/notifications/debug-id', authMiddleware, async (req, res) => {
  try {
    const rawId = toUUID(req.user.id)
    const idType = typeof rawId
    const isBuffer = Buffer.isBuffer(rawId)
    const idStr = isBuffer ? rawId.toString('hex') : String(rawId)
    const idStrDirect = String(rawId)
    // Chercher par téléphone
    const byTel = await sql(
      "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone
    )
    // Compter les notifs avec chaque format
    const countHex = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStr
    ).catch(() => [{n:-1}])
    const countDirect = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStrDirect
    ).catch(() => [{n:-1}])
    const countByTel = byTel[0] ? await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", byTel[0].id
    ).catch(() => [{n:-1}]) : [{n:-1}]
    return res.json({
      telephone: req.user.telephone,
      rawId_type: idType,
      isBuffer,
      idStr_hex: idStr,
      idStr_direct: idStrDirect,
      id_by_tel: byTel[0]?.id || null,
      notifs_with_hex: countHex[0].n,
      notifs_with_direct: countDirect[0].n,
      notifs_with_byTel: countByTel[0].n
    })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/api/v1/notifications', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30
    // Utiliser le telephone (depuis query ou depuis req.user) pour obtenir l'ID fiable
    const tel = req.query.tel || req.user.telephone
    let uidSql = null
    if (tel) {
      try {
        const userRow = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", tel
        )
        if (userRow && userRow[0]) uidSql = userRow[0].id
      } catch(e) {}
    }
    // Fallback: utiliser toUUID(req.user.id) directement
    if (!uidSql) {
      const rawId = toUUID(req.user.id)
      uidSql = Buffer.isBuffer(rawId) ? rawId.toString('hex') : String(rawId)
    }

    let notifs = []
    let nonLues = [{count:0}]
    try {
      notifs = await sql(
        "SELECT id::text, type, titre, message, lu, data, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2",
        uidSql, limit
      )
    } catch(e) { console.error('GET notifs err:', e.message) }
    try {
      nonLues = await sql(
        "SELECT COUNT(*)::int as count FROM notifications WHERE utilisateur_id = $1 AND lu = FALSE",
        uidSql
      )
    } catch(e) { console.error('GET nonLues err:', e.message) }
    return ok(res, { notifications: notifs, nonLues: Number(nonLues[0]?.count || 0) })
  } catch(e) { return err(res, e.message, 500) }
})

// Marquer une notification comme lue
app.patch('/api/v1/notifications/:id/lu', authMiddleware, async (req, res) => {
  try {
    let uid = String(toUUID(req.user.id))
    try { const r = await sql("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await pgPool.query(
      `UPDATE notifications SET lu = TRUE WHERE id = $1 AND utilisateur_id = $2`,
      [req.params.id, uid]
    )
    return ok(res, { message: 'Marquée comme lue' })
  } catch(e) { return err(res, e.message, 500) }
})

// Marquer toutes comme lues
app.patch('/api/v1/notifications/tout-lire', authMiddleware, async (req, res) => {
  try {
    let uid = String(toUUID(req.user.id))
    try { const r = await sql("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await pgPool.query(
      `UPDATE notifications SET lu = TRUE WHERE utilisateur_id = $1`,
      [uid]
    )
    return ok(res, { message: 'Toutes marquées comme lues' })
  } catch(e) { return err(res, e.message, 500) }
})

// Envoyer une notification admin → utilisateur(s)
app.post('/api/v1/notifications/envoyer', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, role: targetRole, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    if (userId) {
      await notifier(userId, type, titre, message)
      await logAction(req.user, 'notif_envoyee', {id:'', prenom:'', nom:'', role:targetRole||'?', telephone:userId||'?'}, titre+' — '+message.slice(0,60))
      return ok(res, { message: 'Notification envoyée', total: 1 })
    } else if (targetRole) {
      let users = []
      try {
        users = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE role = $1 AND statut NOT IN ('suspendu','bloque')",
          targetRole
        )
      } catch(e) { users = [] }
      for (const u of users) {
        await notifier(u.id, type, titre, message)
      }
      return ok(res, { message: users.length + ' notification(s) envoyée(s)', total: users.length })
    } else {
      return err(res, 'userId ou role requis')
    }
  } catch(e) { return err(res, e.message, 500) }
})

// Envoi masse multi-rôles
app.post('/api/v1/notifications/masse', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { titre, message, type = 'systeme', roles } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    const targetRoles = (roles && roles.length) ? roles : ['client','agent','business','mini_master','master','superviseur','support_client','support_tech','superviseur','admin']
    let total = 0
    const debug = []
    // Snapshot base
    try {
      const snap = await sql(
        'SELECT role, statut, COUNT(*)::int as n FROM utilisateurs GROUP BY role, statut'
      )
      debug.push('snap:' + JSON.stringify(snap))
      console.log('MASSE SNAP', JSON.stringify(snap))
    } catch(e) { debug.push('snap_err:' + e.message); console.log('MASSE SNAP ERR', e.message) }
    // Requête directe par rôle
    for (const r of targetRoles) {
      let users = []
      try {
        users = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE role = $1 AND statut NOT IN ('suspendu','bloque')",
          r
        )
      } catch(e) { debug.push('err_' + r + ':' + e.message); console.log('MASSE ERR', r, e.message) }
      debug.push(r + ':' + users.length)
      console.log('MASSE ROLE', r, users.length)
      for (const u of users) {
        await notifier(u.id, type, titre, message, {})
        total++
      }
    }
    console.log('MASSE TOTAL', total)
    // Enregistrer la campagne dans l'historique centralisé
    const cibleLabel = (roles && roles.length) ? roles.join(', ') : 'tous'
    await pgPool.query(
      "INSERT INTO notif_campagnes (titre, message, type, cible, nb_destinataires, envoye_par) VALUES ($1,$2,$3,$4,$5,$6)",
      [titre, message, type, cibleLabel, total, req.user.role]
    ).catch(e => console.log('campagne save err:', e.message))
    await logAction(req.user, 'notif_masse', {id:'',prenom:'',nom:'',role:cibleLabel,telephone:''},
      titre+' — '+message.slice(0,60)+' ('+total+' destinataires)')
    return ok(res, { message: total + ' notification(s) envoyée(s)', total, debug })
  } catch(e) { 
    console.error('masse notif erreur:', e.message)
    return err(res, e.message, 500) 
  }
})

// Historique notifications d'un utilisateur (backoffice)
app.get('/api/v1/notifications/user/:userId', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const notifs = await sql(
      "SELECT id::text, utilisateur_id, type, titre, message, lu, data, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2",
      req.params.userId, limit
    )
    return ok(res, { notifications: notifs, total: notifs.length })
  } catch(e) { return err(res, e.message, 500) }
})

// Toutes les notifications du système (backoffice admin)
app.get('/api/v1/notifications/all', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    const offset = parseInt(req.query.offset) || 0
    const type = req.query.type || null
    const lu = req.query.lu !== undefined ? req.query.lu === 'true' : null
    const roleFilter = req.query.role || null  // filtre par rôle destinataire
    let q = "SELECT n.id::text, n.utilisateur_id, n.type, n.titre, n.message, n.lu, n.created_at::text, u.telephone, u.prenom, u.nom, u.role FROM notifications n LEFT JOIN utilisateurs u ON u.id::text = n.utilisateur_id WHERE 1=1"
    const params = []
    if (type) { params.push(type); q += " AND n.type = $" + params.length }
    if (lu !== null) { params.push(lu); q += " AND n.lu = $" + params.length }
    if (roleFilter === 'support') {
      q += " AND u.role IN ('support_client','support_tech')"
    } else if (roleFilter) {
      params.push(roleFilter); q += " AND u.role = $" + params.length
    }
    const countQ = q.replace(
      "SELECT n.id::text, n.utilisateur_id, n.type, n.titre, n.message, n.lu, n.created_at::text, u.telephone, u.prenom, u.nom, u.role",
      "SELECT COUNT(*)::int as n"
    )
    params.push(limit); q += " ORDER BY n.created_at DESC LIMIT $" + params.length
    params.push(offset); q += " OFFSET $" + params.length
    const notifs = await sql(q, ...params)
    const countParams = params.slice(0, params.length - 2)
    const countRow = await sql(countQ, ...countParams).catch(async () => {
      return sql("SELECT COUNT(*)::int as n FROM notifications")
    })
    return ok(res, { notifications: notifs, total: countRow[0].n })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer une notification (admin)
// Supprimer plusieurs notifications par IDs (admin) — sélection multiple
// DOIT être AVANT /:id pour ne pas être capturé par le wildcard
app.delete('/api/v1/notifications/bulk', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { ids, titre, message, partout } = req.body
    // Mode "supprimer pour tous" : supprime toutes les notifs avec ce titre+message
    if (partout && titre && message) {
      const result = await pgPool.query(
        "DELETE FROM notifications WHERE titre = $1 AND message = $2",
        [titre, message]
      )
      return ok(res, { message: 'Notification supprimée pour tous les utilisateurs', count: result })
    }
    // Mode sélection : supprime une liste d'IDs
    if (!ids || !ids.length) return err(res, 'ids requis', 400)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const result = await pgPool.query(
      `DELETE FROM notifications WHERE id::text IN (${placeholders})`,
      ...ids
    )
    return ok(res, { message: `${ids.length} notification(s) supprimée(s)`, count: result })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer une notification individuelle (admin) — APRÈS /bulk pour éviter conflit wildcard
app.delete('/api/v1/notifications/user/:userId', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const result = await pgPool.query("DELETE FROM notifications WHERE utilisateur_id = $1", [req.params.userId])
    return ok(res, { message: 'Notifications supprimées', count: result })
  } catch(e) { return err(res, e.message, 500) }
})

app.delete('/api/v1/notifications/:id', authMiddleware, role('admin', 'backoffice', 'support_client'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM notifications WHERE id::text = $1", [req.params.id])
    return ok(res, { message: 'Notification supprimée' })
  } catch(e) { return err(res, e.message, 500) }
})

// Envoyer notif directe depuis backoffice vers un utilisateur (par userId ou telephone)
app.post('/api/v1/notifications/direct', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, telephone, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    if (!userId && !telephone) return err(res, 'userId ou telephone requis')
    let uid = userId
    if (!uid && telephone) {
      const row = await sql(
        "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", telephone
      ).catch(() => [])
      if (!row || !row[0]) return err(res, 'Utilisateur introuvable', 404)
      uid = row[0].id
    }
    await notifier(uid, type, titre, message, { par: req.user.role })
    return ok(res, { message: 'Notification envoyée' })
  } catch(e) { return err(res, e.message, 500) }
})

// Notifier plusieurs utilisateurs par leurs téléphones (sélection manuelle)
app.post('/api/v1/notifications/multi', authMiddleware, role(...SUPPORT_CLIENT, 'superviseur'), async (req, res) => {
  try {
    const { telephones, userIds, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    const ids = []
    if (userIds && userIds.length) {
      ids.push(...userIds)
    }
    if (telephones && telephones.length) {
      for (const tel of telephones) {
        const row = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", tel
        ).catch(() => [])
        if (row && row[0]) ids.push(row[0].id)
      }
    }
    if (!ids.length) return err(res, 'Aucun destinataire trouvé', 404)
    let sent = 0
    for (const uid of ids) {
      await notifier(uid, type, titre, message, { par: req.user.role })
      sent++
    }
    // Enregistrer la campagne
    const cibleMulti = telephones ? 'individuel ('+sent+' tel.)' : 'sélection ('+sent+')'
    await pgPool.query(
      "INSERT INTO notif_campagnes (titre, message, type, cible, nb_destinataires, envoye_par) VALUES ($1,$2,$3,$4,$5,$6)",
      [titre, message, type, cibleMulti, sent, req.user.role]
    ).catch(e => console.log('campagne save err:', e.message))
    return ok(res, { message: sent + ' notification(s) envoyée(s)', total: sent })
  } catch(e) { return err(res, e.message, 500) }
})

// ── CAMPAGNES NOTIFICATIONS — historique centralisé ──

// GET : liste des campagnes envoyées
app.get('/api/v1/notif-campagnes', authMiddleware, role('admin', 'backoffice', 'superviseur', 'support_client', 'support_tech'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const campagnes = await sql(
      "SELECT id, titre, message, type, cible, nb_destinataires, envoye_par, created_at::text FROM notif_campagnes ORDER BY created_at DESC LIMIT $1",
      limit
    )
    return ok(res, { campagnes })
  } catch(e) { return err(res, e.message, 500) }
})

// DELETE : supprimer une campagne ET toutes ses notifications chez tous les destinataires
app.delete('/api/v1/notif-campagnes/:id', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const camp = await sql(
      "SELECT titre, message FROM notif_campagnes WHERE id = $1",
      req.params.id
    )
    if (!camp || !camp[0]) return err(res, 'Campagne introuvable', 404)
    const { titre, message } = camp[0]
    // Supprimer toutes les notifs avec ce titre+message
    const deleted = await pgPool.query(
      "DELETE FROM notifications WHERE titre = $1 AND message = $2",
      [titre, message]
    )
    // Supprimer la campagne de l'historique
    await pgPool.query("DELETE FROM notif_campagnes WHERE id = $1", [req.params.id])
    return ok(res, { message: 'Campagne supprimée', notifs_supprimees: deleted })
  } catch(e) { return err(res, e.message, 500) }
})

// ── Job de renouvellement KYC automatique ──
// Toutes les heures : repasser en en_attente les comptes actifs
// dont la validation KYC a plus de 48 heures
setInterval(async () => {
  try {
    const result = await pgPool.query(`
      UPDATE utilisateurs
      SET statut = 'en_attente'
      WHERE statut = 'actif'
        AND role = 'client'
        AND kyc_valide_le IS NOT NULL
        AND kyc_valide_le < NOW() - INTERVAL '48 hours'
    `)
    if (result > 0) {
      console.log(`🔄 KYC auto-renouvellement : ${result} compte(s) passé(s) en attente`)
    }
  } catch(e) {
    console.warn('KYC job erreur:', e.message)
  }
}, 60 * 60 * 1000) // toutes les heures

console.log('⏱️  Job KYC auto-renouvellement actif (vérification toutes les heures)')

// ── Job anti-triche : détecter les remboursements filleul → parrain dans les 7 jours ──
// Toutes les heures : pour chaque rattachement valide datant de moins de 7 jours,
// on vérifie si le filleul a renvoyé de l'argent à son parrain depuis le rattachement.
// Si oui : c'est la preuve d'un rattachement fictif → détachement automatique + alerte.
// Au-delà de 7 jours sans remboursement détecté, le rattachement est considéré sain
// et n'est plus revérifié (marqué verifie_remboursement = TRUE).
setInterval(async () => {
  try {
    const aSurveiller = await sql(`
      SELECT id::text as id, parrain_id, filleul_id, date_entree::text as "dateEntree"
      FROM rattachements
      WHERE statut = 'valide'
        AND verifie_remboursement = FALSE
        AND date_entree IS NOT NULL
        AND date_entree >= NOW() - INTERVAL '7 days'
    `).catch(() => [])
    for (const r of aSurveiller) {
      const retour = await sql(`
        SELECT t.montant::float as montant, t.date_creation::text as "dateCreation"
        FROM transactions t
        JOIN comptes cs ON cs.id = t.compte_source_id
        JOIN comptes cd ON cd.id = t.compte_dest_id
        WHERE cs.utilisateur_id = $1 AND cd.utilisateur_id = $2
          AND t.type = 'transfert' AND t.statut = 'complete'
          AND t.date_creation >= $3::timestamptz
        ORDER BY t.date_creation DESC LIMIT 1
      `, r.filleul_id, r.parrain_id, r.dateEntree).then(rows => rows[0] || null).catch(() => null)
      if (retour) {
        // Triche confirmée : détacher automatiquement + alerter le back-office
        await pgPool.query(`DELETE FROM rattachements WHERE id = $1`, [r.id]).catch(()=>{})
        await creerAlerteRattachementSuspect(r.parrain_id, r.filleul_id, retour.montant, retour.dateCreation,
          `Le filleul a renvoyé ${retour.montant} au parrain dans les 7 jours suivant son rattachement (remboursement = triche confirmée)`)
      }
    }
    // Marquer comme vérifiés (sains) tous les rattachements qui ont dépassé 7 jours sans remboursement détecté
    const cloture = await pgPool.query(`
      UPDATE rattachements SET verifie_remboursement = TRUE
      WHERE statut = 'valide' AND verifie_remboursement = FALSE
        AND date_entree IS NOT NULL AND date_entree < NOW() - INTERVAL '7 days'
    `).catch(() => 0)
    if (aSurveiller.length > 0) console.log(`🕵️  Anti-triche : ${aSurveiller.length} rattachement(s) sous surveillance (fenêtre 7 jours)`)
  } catch(e) {
    console.warn('Anti-triche job erreur:', e.message)
  }
}, 60 * 60 * 1000) // toutes les heures

console.log('⏱️  Job anti-triche rattachements actif (vérification toutes les heures)')


// ═══════════════════════════════════════════════════════════════
// FLUX ANALYTICS — transferts par catégorie, dépôts, retraits
// GET /api/v1/flux/analytics?period=month&statut=complete
// ═══════════════════════════════════════════════════════════════
app.get('/api/v1/flux/analytics', authMiddleware, role('admin','backoffice','superviseur'), async (req, res) => {
  try {
    const { period = 'month', statut = 'complete', zone } = req.query

    const now = new Date()
    let debut, debutPrev, finPrev
    if (period === 'today') {
      debut     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      debutPrev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      finPrev   = debut
    } else if (period === 'week') {
      debut     = new Date(now); debut.setDate(debut.getDate() - 7)
      debutPrev = new Date(now); debutPrev.setDate(debutPrev.getDate() - 14)
      finPrev   = debut
    } else if (period === 'year') {
      debut     = new Date(now.getFullYear(), 0, 1)
      debutPrev = new Date(now.getFullYear() - 1, 0, 1)
      finPrev   = debut
    } else {
      debut     = new Date(now.getFullYear(), now.getMonth(), 1)
      debutPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      finPrev   = debut
    }

    const statutFilter = statut === 'all' ? '' : `AND t.statut = '${statut.replace(/'/g,"''")}'`
    const zoneFilter   = zone ? `AND (us.zone = '${zone.replace(/'/g,"''")}' OR ud.zone = '${zone.replace(/'/g,"''")}')` : ''

    const baseSQL = (from, to) => `
      SELECT t.type, t.statut, t.montant::float, t.frais::float,
             t.agent_id::text as "agentId",
             t.date_creation as date_creation,
             us.role as "srcRole", ud.role as "destRole",
             us.zone as "srcZone", ud.zone as "destZone"
      FROM transactions t
      LEFT JOIN comptes cs ON cs.id = t.compte_source_id
      LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id
      LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
      LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id
      WHERE t.date_creation >= $1::timestamptz
        AND t.date_creation < $2::timestamptz
        ${statutFilter}
        ${zoneFilter}
      ORDER BY t.date_creation DESC
      LIMIT 5000`

    const [txns, txnsPrev] = await Promise.all([
      sql(baseSQL(debut, now), debut.toISOString(), now.toISOString()),
      sql(baseSQL(debutPrev, finPrev), debutPrev.toISOString(), finPrev.toISOString())
    ])

    const pairKey = (r1, r2) => [r1||'inconnu', r2||'inconnu'].sort().join('↔')

    const TRANSFER_CATS = [
      'client↔client','agent↔agent','mini_master↔mini_master','master↔master',
      'agent↔mini_master','agent↔master','mini_master↔master',
      'agent↔business','business↔business'
    ]

    const calcStats = (list) => {
      const stats = {}
      TRANSFER_CATS.forEach(c => { stats[c] = { n:0, vol:0 } })
      const depots   = { master:{n:0,vol:0}, mini_master:{n:0,vol:0}, agent:{n:0,vol:0}, autre:{n:0,vol:0} }
      const retraits = { master:{n:0,vol:0}, mini_master:{n:0,vol:0}, agent:{n:0,vol:0}, autre:{n:0,vol:0} }
      const courbe = {}

      list.forEach(tx => {
        const m = Number(tx.montant || 0)
        const sr = tx.srcRole || 'inconnu', dr = tx.destRole || 'inconnu'
        const d = new Date(tx.date_creation)
        let tKey
        if (period === 'today')  tKey = d.getHours() + 'h'
        else if (period === 'week') tKey = d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit'})
        else if (period === 'year') tKey = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()]
        else tKey = d.getDate().toString()
        if (!courbe[tKey]) courbe[tKey] = {}

        if (tx.type === 'transfert') {
          const pk = pairKey(sr, dr)
          if (stats[pk]) {
            stats[pk].n++; stats[pk].vol += m
            courbe[tKey][pk] = (courbe[tKey][pk] || 0) + m
          }
        } else if (tx.type === 'depot') {
          const bucket = ['master','mini_master','agent'].includes(sr) ? sr : 'autre'
          depots[bucket].n++; depots[bucket].vol += m
          courbe[tKey]['depot_'+bucket] = (courbe[tKey]['depot_'+bucket] || 0) + m
        } else if (tx.type === 'retrait') {
          const bucket = ['master','mini_master','agent'].includes(sr) ? sr : 'autre'
          retraits[bucket].n++; retraits[bucket].vol += m
          courbe[tKey]['retrait_'+bucket] = (courbe[tKey]['retrait_'+bucket] || 0) + m
        }
      })
      return { stats, depots, retraits, courbe }
    }

    const curr = calcStats(txns)
    const prev = calcStats(txnsPrev)

    const evol = (c, p) => !p ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100)

    const CAT_LABELS = {
      'client↔client':'Clients ↔ Clients','agent↔agent':'Agents ↔ Agents',
      'mini_master↔mini_master':'Mini-Masters ↔ Mini-Masters','master↔master':'Masters ↔ Masters',
      'agent↔mini_master':'Mini-Masters ↔ Agents','agent↔master':'Masters ↔ Agents',
      'mini_master↔master':'Masters ↔ Mini-Masters',
      'agent↔business':'Business ↔ Agents','business↔business':'Business ↔ Business'
    }

    const transferts = TRANSFER_CATS.map(id => {
      const c = curr.stats[id]||{n:0,vol:0}, p = prev.stats[id]||{n:0,vol:0}
      return { id, label: CAT_LABELS[id]||id, n:c.n, vol:c.vol,
               avg: c.n>0 ? Math.round(c.vol/c.n) : 0,
               evol_n: evol(c.n,p.n), evol_vol: evol(c.vol,p.vol) }
    })

    const buildFlow = (cur, prv) => {
      const out = {}
      ;['master','mini_master','agent','autre'].forEach(k => {
        const c=cur[k]||{n:0,vol:0}, p=prv[k]||{n:0,vol:0}
        out[k] = { n:c.n, vol:c.vol, avg:c.n>0?Math.round(c.vol/c.n):0, evol_vol:evol(c.vol,p.vol) }
      })
      return out
    }

    return ok(res, {
      periode: period,
      debut: debut.toISOString(),
      transferts,
      depots:   buildFlow(curr.depots,   prev.depots),
      retraits: buildFlow(curr.retraits, prev.retraits),
      courbe:   Object.entries(curr.courbe).map(([label,vals]) => ({label,...vals})),
      total_txns: txns.length,
    })
  } catch(e) { return err(res, e.message, 500) }
})


// ═══════════════════════════════════════════════════════════
// ROUTES SUPPORT TECHNIQUE — logs & historique
// ═══════════════════════════════════════════════════════════

// GET /tech/logs — journal des erreurs techniques
// ═══ JOURNAL DES ACTIONS (traçabilité) ═══
app.get('/api/v1/actions-log', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { action, limit=50, offset=0 } = req.query
    const lim = Math.min(parseInt(limit)||50, 200)
    const off = parseInt(offset)||0
    const actionFilter = action && action!=='all' ? `AND action = '${action.replace(/'/g,"''")}'` : ''
    const rows = await sql(
      `SELECT id::text, acteur_nom, acteur_role, acteur_tel,
              action, cible_nom, cible_role, cible_tel, detail,
              created_at
       FROM actions_log
       WHERE 1=1 ${actionFilter}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      lim, off
    )
    const total = await sql(
      `SELECT COUNT(*)::int as n FROM actions_log WHERE 1=1 ${actionFilter}`
    )
    return ok(res, { logs: rows, total: total[0]?.n || 0 })
  } catch(e){ return err(res, e.message, 500) }
})

app.get('/api/v1/tech/logs', authMiddleware, role('admin','backoffice','support_tech'), async (req, res) => {
  try {
    const { type = 'all', limit = 15 } = req.query
    const lim = Math.min(parseInt(limit)||15, 50)
    const results = []

    // Transactions échouées → erreurs API
    if (type === 'all' || type === 'api') {
      try {
        const rows = await sql(
          `SELECT 'api' as type, 'Transaction échouée' as message, reference as detail, date_creation as created_at
           FROM transactions WHERE statut = 'echec' ORDER BY date_creation DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'api', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    // Notifications non lues depuis longtemps → erreurs notif
    if (type === 'all' || type === 'notif') {
      try {
        const rows = await sql(
          `SELECT 'notif' as type, 'Notification non lue (ancienne)' as message, titre as detail, created_at
           FROM notifications WHERE lu = false AND created_at < NOW() - INTERVAL '7 days'
           ORDER BY created_at DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'notif', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    // Documents KYC rejetés → erreurs KYC
    if (type === 'all' || type === 'kyc') {
      try {
        const rows = await sql(
          `SELECT 'kyc' as type, 'Documents KYC rejetés' as message,
                  u.telephone as detail, k.updated_at as created_at
           FROM kyc_documents k
           JOIN utilisateurs u ON u.id = k.utilisateur_id
           WHERE k.statut = 'rejete'
           ORDER BY k.updated_at DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'kyc', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    results.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    return ok(res, results.slice(0, lim))
  } catch(e) { return err(res, e.message, 500) }
})

// GET /tech/history — historique des actions techniques
app.get('/api/v1/tech/history', authMiddleware, role('admin','backoffice','support_tech'), async (req, res) => {
  try {
    const { limit = 15 } = req.query
    const lim = Math.min(parseInt(limit)||15, 50)
    const history = []

    // Transactions complétées ou échouées récentes
    try {
      const rows = await sql(
        `SELECT 'force_txn' as action_type,
                'Transaction ' || reference || ' → ' || statut as description,
                COALESCE(date_completion, date_creation) as created_at,
                'Support Tech' as auteur
         FROM transactions
         WHERE statut IN ('completee','echec')
         ORDER BY COALESCE(date_completion, date_creation) DESC LIMIT $1`,
        Math.ceil(lim/2)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    // Tickets résolus/fermés par support_tech
    try {
      const rows = await sql(
        `SELECT 'resolve_ticket' as action_type,
                'Ticket ' || reference || ' — ' || statut as description,
                COALESCE(date_resolution, date_creation) as created_at,
                'Support Tech' as auteur
         FROM tickets_support
         WHERE service = 'support_tech' AND statut IN ('resolu','ferme','rejete')
         ORDER BY COALESCE(date_resolution, date_creation) DESC LIMIT $1`,
        Math.ceil(lim/2)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    // Alertes créées par support_tech
    try {
      const rows = await sql(
        `SELECT 'create_alert' as action_type,
                'Alerte créée : ' || titre as description,
                created_at,
                COALESCE(auteur, 'Support Tech') as auteur
         FROM alertes
         WHERE service = 'support_tech'
         ORDER BY created_at DESC LIMIT $1`,
        Math.ceil(lim/3)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    history.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    return ok(res, history.slice(0, lim))
  } catch(e) { return err(res, e.message, 500) }
})

// Migration automatique des colonnes KYC + comptes
async function autoMigrate() {
  const cols = [
    // Colonnes KYC utilisateurs
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_niveau_demande TEXT DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_valide_le TIMESTAMP DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_rejete_le TIMESTAMP DEFAULT NULL`,
    // Nom commercial (optionnel) — affiché en priorité pour les professionnels, à défaut prénom+nom
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS nom_commercial TEXT DEFAULT NULL`,
    // Colonnes comptes — garantir que created_at/updated_at/type_compte/plafond_mensuel existent
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS type_compte TEXT DEFAULT 'client'`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS plafond_mensuel NUMERIC DEFAULT 20000`,
    // Colonnes kyc_documents — garantir date_soumission et created_at
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_soumission TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS hash_fichier TEXT DEFAULT 'none'`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS commentaire TEXT`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verifie_par TEXT`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_verification TIMESTAMP`,
    // Colonne FCM token pour push notifications
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL`,
    // Force le changement de PIN à la prochaine connexion après une réinitialisation (1234 temporaire)
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS pin_a_changer BOOLEAN DEFAULT FALSE`,
    // Code de récupération (perte de téléphone, sans appeler le support) — jamais stocké en clair
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS code_recuperation_hash TEXT DEFAULT NULL`,
    // Compteur d'échecs de PIN à la connexion — blocage après 4 échecs, toutes apps et rôles confondus
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS tentatives_pin_echouees INTEGER DEFAULT 0`,
    // Géolocalisation — Agent, Business, Mini-Master, Master doivent obligatoirement enregistrer
    // la position fixe de leur activité pour la fonctionnalité "Trouver des agents" côté Client.
    // Aucune option de masquage : position_confirmee=FALSE bloque l'accès à l'app tant que la
    // position n'a pas été renseignée (nouveau compte, ou compte existant à migrer).
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS position_latitude DOUBLE PRECISION DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS position_longitude DOUBLE PRECISION DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS position_maj_le TIMESTAMP DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS position_confirmee BOOLEAN DEFAULT FALSE`,
    // Nettoyage : l'ancienne colonne de bascule visible/masqué n'existe plus dans ce modèle
    `ALTER TABLE utilisateurs DROP COLUMN IF EXISTS position_visible`,
  ]
  for (const sqlCol of cols) {
    await pgPool.query(sqlCol).catch(e => console.log('migrate:', e.message))
  }
  console.log('✅ Migration colonnes KYC + comptes OK')
}
autoMigrate()

// Créer table OTP si elle n'existe pas
pgPool.query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS montant_original numeric(15,2) DEFAULT 0`).catch(()=>{})

pgPool.query(`CREATE TABLE IF NOT EXISTS otp_retraits (
  cle text PRIMARY KEY, otp text NOT NULL, amt numeric NOT NULL,
  frais numeric NOT NULL, total numeric NOT NULL, taux numeric NOT NULL,
  client_id text NOT NULL, client_compte_id text NOT NULL,
  client_nom text, agent_id text NOT NULL, tentatives integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT NOW()
)`).then(()=>console.log('✅ otp_retraits OK')).catch(e=>console.warn('otp_retraits:',e.message))
pgPool.query(`ALTER TABLE otp_retraits ADD COLUMN IF NOT EXISTS tentatives integer NOT NULL DEFAULT 0`).catch(()=>{})

// Même mécanisme d'autorisation OTP que le retrait, appliqué à "Encaisser un client" (Business) —
// une simple photo du QR client ne suffit plus : le client doit lire et transmettre le code
// envoyé sur SON compte pour que l'encaissement se termine.
pgPool.query(`CREATE TABLE IF NOT EXISTS otp_encaissements (
  cle text PRIMARY KEY, otp text NOT NULL, amt numeric NOT NULL,
  frais numeric NOT NULL, frais_client numeric NOT NULL, frais_business numeric NOT NULL,
  total_debit_client numeric NOT NULL,
  client_id text NOT NULL, client_compte_id text NOT NULL, client_nom text,
  business_id text NOT NULL, business_compte_id text NOT NULL, tentatives integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT NOW()
)`).then(()=>console.log('✅ otp_encaissements OK')).catch(e=>console.warn('otp_encaissements:',e.message))
pgPool.query(`ALTER TABLE otp_encaissements ADD COLUMN IF NOT EXISTS tentatives integer NOT NULL DEFAULT 0`).catch(()=>{})

// Blocage temporaire après trop de mauvaises tentatives — empêche de simplement relancer une
// nouvelle demande OTP pour recommencer à deviner. Le blocage porte sur celui qui SAISIT le code
// (l'agent pour un retrait, le business pour un encaissement) — c'est lui le point de contrôle,
// pas le client qui ne fait que recevoir le code et n'est pas responsable des mauvais essais.
pgPool.query(`CREATE TABLE IF NOT EXISTS appareils_connus (
  id text PRIMARY KEY, utilisateur_id text NOT NULL, device_id text NOT NULL,
  user_agent text, first_seen timestamptz NOT NULL, last_seen timestamptz NOT NULL,
  UNIQUE(utilisateur_id, device_id)
)`).then(()=>console.log('✅ appareils_connus OK')).catch(e=>console.warn('appareils_connus:',e.message))

pgPool.query(`CREATE TABLE IF NOT EXISTS fcm_tokens (
  id text PRIMARY KEY, utilisateur_id text NOT NULL, device_id text NOT NULL,
  fcm_token text NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(utilisateur_id, device_id)
)`).then(()=>console.log('✅ fcm_tokens OK')).catch(e=>console.warn('fcm_tokens:',e.message))

// Vérification par code lors d'une connexion depuis un appareil non reconnu : le code part en
// push vers les AUTRES appareils déjà connus du compte (pas de coût, réutilise l'infrastructure
// FCM déjà en place), et doit être saisi sur le nouvel appareil pour finaliser la connexion.
pgPool.query(`CREATE TABLE IF NOT EXISTS verifications_nouvel_appareil (
  cle text PRIMARY KEY, code text NOT NULL, utilisateur_id text NOT NULL, device_id text NOT NULL,
  tentatives integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT NOW()
)`).then(()=>console.log('✅ verifications_nouvel_appareil OK')).catch(e=>console.warn('verifications_nouvel_appareil:',e.message))

pgPool.query(`CREATE TABLE IF NOT EXISTS otp_lockouts (
  cle text PRIMARY KEY, blocked_until timestamptz NOT NULL, offenses integer NOT NULL DEFAULT 1
)`).then(()=>console.log('✅ otp_lockouts OK')).catch(e=>console.warn('otp_lockouts:',e.message))
pgPool.query(`ALTER TABLE otp_lockouts ADD COLUMN IF NOT EXISTS offenses integer NOT NULL DEFAULT 1`).catch(()=>{})

app.listen(PORT, () => {
  console.log(`🚀 ManiPay API v4.50 → port ${PORT}`)
  initManiPaySystem()
})

main().catch(e => { console.error('main() erreur:', e.message) })
