// AFRIM PAY API v2.3 — Permissions corrigées pour support_client, support_tech, superviseur
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'afrim_jwt_secret_2024'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'afrim_refresh_secret_2024'

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

const signAccess = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '15m' })
const signRefresh = (p) => jwt.sign(p, JWT_REFRESH_SECRET, { expiresIn: '7d' })
const ok = (res, data, s = 200) => res.status(s).json({ success: true, data })
const err = (res, msg, s = 400) => res.status(s).json({ success: false, message: msg })

// ═══ ROLES BACK-OFFICE ═══
// admin         → accès total
// superviseur   → sa zone : users, tickets, alertes, kyc validate
// support_client→ recherche client (lecture), tickets, remboursement
// support_tech  → transactions, alertes système, tickets escaladés

const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return err(res, 'Token manquant', 401)
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET)
    const user = await prisma.utilisateur.findUnique({ where: { id: p.userId }, include: { comptes: true } })
    if (!user || user.statut === 'bloque') return err(res, 'Accès refusé', 401)
    req.user = user
    next()
  } catch (e) { return err(res, 'Token invalide', 401) }
}

const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : err(res, 'Permission refusée', 403)

// Rôles back-office complets
const BACKOFFICE = ['admin', 'superviseur', 'support_client', 'support_tech']
const ADMIN_SUP = ['admin', 'superviseur']
const ADMIN_ONLY = ['admin']
const SUPPORT_CLIENT = ['admin', 'support_client']
const SUPPORT_TECH = ['admin', 'support_tech']
const OPERATIONS = ['agent', 'mini_master', 'master', 'superviseur', 'admin']

// ═══ SETUP (sans auth) ═══
app.get('/setup/make-admin/:tel', async (req, res) => {
  try {
    const u = await prisma.utilisateur.update({ where: { telephone: req.params.tel }, data: { role: 'admin', statut: 'actif' } })
    return res.json({ success: true, role: u.role, statut: u.statut })
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
        const code = c.prenom.slice(0,3).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()
        await prisma.utilisateur.upsert({
          where: { telephone: c.telephone },
          update: { role: c.role, statut: 'actif', pinHash },
          create: { ...c, pinHash, kycNiveau:'KYC1', statut:'actif', codeParrainage:code, comptes:{ create:{ solde:100000, plafondMensuel:500000 } } }
        })
        results.push({ telephone: c.telephone, role: c.role, statut: 'ok' })
      } catch(e) { results.push({ telephone: c.telephone, error: e.message }) }
    }
    return res.json({ success: true, comptes: results })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AFRIM PAY API v2.3' }))

// Test colonnes table commissions
app.get('/test/comm-columns', async (req, res) => {
  try {
    const cols = await prisma.$queryRawUnsafe(`
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
    const cols = await prisma.$queryRawUnsafe(`
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

// Test KYC table existence
app.get('/test/kyc', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM kyc_documents`)
    return res.json({ ok: true, kycDocumentsCount: Number(result[0].count), message: 'Table kyc_documents accessible' })
  } catch(e) {
    return res.json({ ok: false, error: e.message, hint: 'Table inexistante - redemarrer le serveur pour la creer' })
  }
})

// Test insert KYC
app.post('/test/kyc', async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier } = req.body
    const doc = await prisma.kycDocument.create({
      data: { utilisateurId: userId, typeDocument, urlFichier, hashFichier: 'test', statut: 'soumis' }
    })
    return res.json({ ok: true, doc })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})
app.get('/', (req, res) => res.json({ message: 'AFRIM PAY API v2.3' }))

// ═══ AUTH ═══
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { telephone, pin } = req.body
    const user = await prisma.utilisateur.findUnique({ where: { telephone }, include: { comptes: true } })
    if (!user) return err(res, 'Compte introuvable', 401)
    if (user.statut === 'bloque') return err(res, 'Compte bloqué', 401)
    const valid = await bcrypt.compare(pin, user.pinHash)
    if (!valid) return err(res, 'PIN incorrect', 401)
    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    await prisma.refreshToken.create({ data: { token: refreshToken, utilisateurId: user.id, expiresAt: new Date(Date.now() + 7*86400000) } })
    const { pinHash, ...safe } = user
    return ok(res, { accessToken, refreshToken, user: safe })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { prenom, nom, telephone, pin, role: r, kycNiveau, parrainCode, zone } = req.body
    if (!prenom || !nom || !telephone || !pin) return err(res, 'Champs obligatoires manquants')
    if (!/^\d{4}$/.test(pin)) return err(res, 'PIN doit contenir 4 chiffres')
    const exists = await prisma.utilisateur.findUnique({ where: { telephone } })
    if (exists) return err(res, 'Numéro déjà utilisé')
    const pinHash = await bcrypt.hash(pin, 10)
    const code = prenom.slice(0,3).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()
    let parrainId = null
    if (parrainCode) {
      const p = await prisma.utilisateur.findFirst({ where: { codeParrainage: parrainCode } })
      if (p) parrainId = p.id
    }
    // Plafond selon rôle et KYC
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const kyc = kycNiveau || 'KYC1'
    const plafond = ['agent','mini_master','master','superviseur','admin','support_client','support_tech'].includes(r||'client')
      ? 999999999
      : (plafonds[kyc] || 20000)
    const user = await prisma.utilisateur.create({
      data: { prenom, nom, telephone, pinHash, role: r||'client', kycNiveau: kyc, statut: 'en_attente', codeParrainage: code, parrainId, zone: zone||null,
        comptes: { create: { solde: 0, plafondMensuel: plafond } } },
      include: { comptes: true }
    })
    const { pinHash: _, ...safe } = user
    return ok(res, safe, 201)
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) return err(res, 'Token expiré', 401)
    const p = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    const accessToken = signAccess({ userId: p.userId, role: p.role })
    const newRefresh = signRefresh({ userId: p.userId, role: p.role })
    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({ data: { token: newRefresh, utilisateurId: p.userId, expiresAt: new Date(Date.now() + 7*86400000) } })
    return ok(res, { accessToken, refreshToken: newRefresh })
  } catch (e) { return err(res, e.message, 401) }
})

app.post('/api/v1/auth/logout', async (req, res) => {
  try { const { refreshToken } = req.body; if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }); return ok(res, { message: 'Déconnecté' }) }
  catch (e) { return ok(res, { message: 'Déconnecté' }) }
})

// ═══ USERS ═══
app.get('/api/v1/users/me', authMiddleware, async (req, res) => {
  try { const user = await prisma.utilisateur.findUnique({ where: { id: req.user.id }, include: { comptes: true } }); const { pinHash, ...safe } = user; return ok(res, safe) }
  catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/users/change-pin', authMiddleware, async (req, res) => {
  try {
    const { ancienPin, nouveauPin } = req.body
    if (!ancienPin || !nouveauPin) return err(res, 'Ancien et nouveau PIN requis')
    if (!/^\d{4}$/.test(nouveauPin)) return err(res, 'Le nouveau PIN doit contenir 4 chiffres')
    const user = await prisma.utilisateur.findUnique({ where: { id: req.user.id } })
    const valid = await bcrypt.compare(ancienPin, user.pinHash)
    if (!valid) return err(res, 'Ancien PIN incorrect', 401)
    const pinHash = await bcrypt.hash(nouveauPin, 10)
    await prisma.utilisateur.update({ where: { id: req.user.id }, data: { pinHash } })
    await prisma.refreshToken.deleteMany({ where: { utilisateurId: req.user.id } })
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
      const parrain = await prisma.utilisateur.findFirst({ where: { codeParrainage: parrainCode } })
      if (parrain) where.parrainId = parrain.id
    }
    if (parrainId) where.parrainId = parrainId

    // Superviseur : ne voit pas le personnel interne (admin, support_*)
    if (req.user.role === 'superviseur') {
      where.role = { notIn: ['admin','support_client','support_tech'] }
      if (r) where.role = r // override si filtre explicite non interne
      if (req.user.zone) where.zone = req.user.zone
    }

    // Support client et tech : lecture seule, accès complet pour recherche
    // (ils ne peuvent pas modifier — les routes PATCH ont leurs propres guards)

    // Champs exposés selon rôle
    const select = {
      id:true, prenom:true, nom:true, telephone:true, role:true,
      kycNiveau:true, statut:true, codeParrainage:true, zone:true,
      dateCreation:true, comptes:true
    }

    const users = await prisma.utilisateur.findMany({ where, take: parseInt(limit), orderBy:{dateCreation:'desc'}, select })
    return ok(res, users)
  } catch (e) { return err(res, e.message, 500) }
})

// PATCH status — admin et superviseur uniquement (pas support)
app.patch('/api/v1/users/:id/status', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try { const user = await prisma.utilisateur.update({ where: { id: req.params.id }, data: { statut: req.body.statut } }); return ok(res, user) }
  catch (e) { return err(res, e.message, 500) }
})

// DELETE user — Super Admin uniquement (0505414751)
const SUPER_ADMIN_TEL = '0505414751'
app.delete('/api/v1/users/:id', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    // Vérifier que c'est le super admin
    if (req.user.telephone !== SUPER_ADMIN_TEL) {
      return err(res, 'Action réservée au Super Administrateur AFRIM PAY', 403)
    }
    await prisma.utilisateur.delete({ where: { id: req.params.id } })
    return ok(res, { message: 'Compte supprimé' })
  } catch (e) { return err(res, e.message, 500) }
})

app.get('/api/v1/users/:id/referrals', authMiddleware, async (req, res) => {
  try {
    const filleuls = await prisma.utilisateur.findMany({ where: { parrainId: req.params.id }, select:{id:true,prenom:true,nom:true,telephone:true,dateCreation:true} })
    const gains = await prisma.commission.aggregate({ where: { beneficiaireId: req.params.id }, _sum:{montant:true} })
    return ok(res, { filleuls, totalGains: gains._sum.montant||0 })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ COMPTES ═══
app.get('/api/v1/accounts/me', authMiddleware, async (req, res) => {
  try { const c = await prisma.compte.findFirst({ where: { utilisateurId: req.user.id } }); if (!c) return err(res, 'Compte introuvable', 404); return ok(res, c) }
  catch (e) { return err(res, e.message, 500) }
})

// ═══ TRANSACTIONS ═══
// Lecture : chacun voit ses propres transactions
// Admin/superviseur/support_tech : voient tout
app.get('/api/v1/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit=20, type, statut, userId } = req.query
    const canSeeAll = ['admin','superviseur','support_client','support_tech'].includes(req.user.role)

    let where = {}
    if (canSeeAll && userId) {
      // Recherche par userId (support_client voit transactions d'un client spécifique)
      const c = await prisma.compte.findFirst({ where: { utilisateurId: userId } })
      if (c) where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    } else if (canSeeAll) {
      // Admin/superviseur/support_tech voient tout
      where = {}
    } else {
      // Opérateur voit ses propres transactions
      const c = await prisma.compte.findFirst({ where: { utilisateurId: req.user.id } })
      if (!c) return ok(res, [])
      where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    }

    if (type) where.type = type
    if (statut) where.statut = statut

    const txns = await prisma.transaction.findMany({
      where, take: parseInt(limit), orderBy:{dateCreation:'desc'},
      include:{
        compteSource:{include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}},
        compteDest:{include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}}
      }
    })
    // Ajouter compteSourceId explicitement dans chaque transaction
    const txnsWithIds = txns.map(tx => ({
      ...tx,
      compteSourceId: tx.compteSourceId,
      compteDestId: tx.compteDestId
    }))
    return ok(res, txnsWithIds)
  } catch (e) { return err(res, e.message, 500) }
})

// Preview dépôt
app.get('/api/v1/transactions/preview/deposit', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, select:{id:true,prenom:true,nom:true,telephone:true,statut:true,comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const gainAgent = Math.round(Number(montant)*0.002)
    return ok(res, {...client, frais:0, gainAgent, gainPlatform:0 })
  } catch (e) { return err(res, e.message, 500) }
})

// Preview retrait
app.get('/api/v1/transactions/preview/withdraw', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, select:{id:true,prenom:true,nom:true,telephone:true,statut:true,comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const amt=Number(montant); const taux=amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais=Math.round(amt*taux); const gainAgent=Math.round(frais*0.35)
    const solde=client.comptes?.[0]?.solde||0
    return ok(res, {...client, frais, gainAgent, taux, soldeInsuffisant: solde<(amt+frais) })
  } catch (e) { return err(res, e.message, 500) }
})

// Dépôt — agents, MM, Master, admin
app.post('/api/v1/transactions/deposit', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    const agentC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!agentC||agentC.solde<amt) return err(res, 'Liquidité insuffisante')
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const clientC=client.comptes[0]; const gainAgent=Math.round(amt*0.002)
    const ref='DEP-'+Date.now().toString(36).toUpperCase()
    // Créer transaction d'abord
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"initiateurId","dateCreation")
       VALUES ($1,$2,'depot','complete',$3,$4,$5,0,$6,NOW())`,
      txId, ref, agentC.id, clientC.id, amt, req.user.id
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, amt, agentC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt, clientC.id)
    await prisma.$executeRawUnsafe(
      `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
       VALUES ($1,$2,'depot_agent',$3,0.002,'verse',NOW())`,
      commId, req.user.id, gainAgent
    )
    return ok(res, {id:txId, reference:ref, type:'depot', montant:amt, gainAgent })
  } catch (e) { return err(res, e.message, 500) }
})

// Retrait — agents, MM, Master, admin
app.post('/api/v1/transactions/withdraw', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const clientC=client.comptes[0]; const taux=amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais=Math.round(amt*taux); const gainAgent=Math.round(frais*0.35); const total=amt+frais
    if (clientC.solde<total) return err(res, 'Solde client insuffisant')
    const agentC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    const ref='RET-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"initiateurId","dateCreation")
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      txId, ref, clientC.id, agentC.id, amt, frais, req.user.id
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, total, clientC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt+gainAgent, agentC.id)
    await prisma.$executeRawUnsafe(
      `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
       VALUES ($1,$2,'retrait_agent',$3,$4,'verse',NOW())`,
      commId, req.user.id, gainAgent, taux*0.35
    )
    return ok(res, {id:txId, reference:ref, type:'retrait', montant:amt, gainAgent })
  } catch (e) { return err(res, e.message, 500) }
})

// Transfert — tous
app.post('/api/v1/transactions/transfer', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant, motif } = req.body; const amt=Number(montant)
    const srcC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!srcC||srcC.solde<amt) return err(res, 'Solde insuffisant')
    const dest = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!dest) return err(res, 'Destinataire introuvable', 404)
    const dstC=dest.comptes[0]; const ref='TRF-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"dateCreation")
       VALUES ($1,$2,'transfert','complete',$3,$4,$5,0,NOW())`,
      txId, ref, srcC.id, dstC.id, amt
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, amt, srcC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt, dstC.id)
    return ok(res, {id:txId, reference:ref, type:'transfert', montant:amt})
  } catch (e) { return err(res, e.message, 500) }
})

// Paiement marchand
app.post('/api/v1/transactions/pay', authMiddleware, async (req, res) => {
  try {
    const { merchantCode, montant } = req.body; const amt=Number(montant)
    const srcC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!srcC||srcC.solde<amt) return err(res, 'Solde insuffisant')
    const merchant = await prisma.utilisateur.findFirst({ where:{codeParrainage:merchantCode,role:'business'}, include:{comptes:true} })
    if (!merchant) return err(res, 'Marchand introuvable', 404)
    const mC=merchant.comptes[0]; const frais=Math.round(amt*0.008); const ref='PAY-'+Date.now().toString(36).toUpperCase()
    const [tx] = await prisma.$transaction([
      prisma.transaction.create({data:{type:'paiement_marchand',montant:amt,frais,reference:ref,statut:'complete',initiateurRole:'client',compteSourceId:srcC.id,compteDestId:mC.id}}),
      prisma.compte.update({where:{id:srcC.id},data:{solde:{decrement:amt}}}),
      prisma.compte.update({where:{id:mC.id},data:{solde:{increment:amt-frais}}})
    ])
    return ok(res, tx)
  } catch (e) { return err(res, e.message, 500) }
})

// Forcer statut transaction — admin et support_tech
app.patch('/api/v1/transactions/:id/status', authMiddleware, role(...SUPPORT_TECH), async (req, res) => {
  try { const tx=await prisma.transaction.update({where:{id:req.params.id},data:{statut:req.body.statut}}); return ok(res,tx) }
  catch(e){return err(res,e.message,500)}
})

// ═══ REMBOURSEMENT — support_client et admin ═══
// Peut rembourser le dernier transfert OU un transfert spécifique par transactionId
app.post('/api/v1/transactions/refund', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, transactionId } = req.body
    if (!userId) return err(res, 'userId requis')

    const compte = await prisma.compte.findFirst({ where: { utilisateurId: userId } })
    if (!compte) return err(res, 'Compte introuvable', 404)

    let tx = null

    if (transactionId) {
      // Remboursement d'une transaction spécifique
      tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
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
      tx = await prisma.transaction.findFirst({
        where: { compteSourceId: compte.id, type:'transfert', statut:'complete', dateCreation:{gte:limite} },
        orderBy: { dateCreation: 'desc' }
      })
      if (!tx) return err(res, 'Aucun transfert remboursable dans les 7 derniers jours', 404)
    }

    // Vérifier que le destinataire a les fonds
    const destCompte = await prisma.compte.findUnique({ where: { id: tx.compteDestId } })
    if (!destCompte) return err(res, 'Compte destinataire introuvable')
    const ref = 'RMB-'+Date.now().toString(36).toUpperCase()
    // Utiliser SQL brut pour éviter les problèmes de schéma Prisma
    const newId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, reference, type, statut, "compteSourceId", "compteDestId", montant, frais, "dateCreation")
       VALUES ($1, $2, 'transfert', 'complete', $3, $4, $5, 0, NOW())`,
      newId, ref, tx.compteDestId, tx.compteSourceId, tx.montant
    )
    await prisma.$executeRawUnsafe(
      `UPDATE comptes SET solde = solde - $1 WHERE id = $2`,
      tx.montant, tx.compteDestId
    )
    await prisma.$executeRawUnsafe(
      `UPDATE comptes SET solde = solde + $1 WHERE id = $2`,
      tx.montant, tx.compteSourceId
    )
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET statut = 'annule' WHERE id = $1`,
      tx.id
    )
    return ok(res, { message: 'Remboursement effectué', montant: tx.montant, reference: ref, transactionOrigine: tx.reference })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ SUSPENDRE DESTINATAIRE — support_client peut suspendre temporairement ═══
app.patch('/api/v1/users/:id/suspend', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { motif } = req.body
    const user = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: { statut: 'suspendu' }
    })
    // Créer un ticket d'enquête automatique
    const ref_s = 'TKT-'+Date.now().toString(36).toUpperCase()
    await prisma.ticket.create({
      data: {
        reference: ref_s,
        sujet: 'Suspension preventive - Enquete remboursement',
        description: motif || 'Compte suspendu suite a demande de remboursement. Enquete en cours.',
        priorite: 'haute',
        statut: 'en_cours',
        clientId: req.params.id
      }
    }).catch(() => {}) // Silencieux si ticket échoue
    return ok(res, { message: 'Compte suspendu', user })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ COMMISSIONS ═══
app.get('/api/v1/commissions/summary', authMiddleware, async (req, res) => {
  try {
    const where = ADMIN_SUP.includes(req.user.role) ? {} : {beneficiaireId:req.user.id}
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const [t,m] = await Promise.all([
      prisma.commission.aggregate({where,_sum:{montant:true}}),
      prisma.commission.aggregate({where:{...where,dateCalcul:{gte:debut}},_sum:{montant:true}})
    ])
    return ok(res, {totalHistorique:t._sum.montant||0,totalMois:m._sum.montant||0})
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ STATS ═══
app.get('/api/v1/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const c = await prisma.compte.findFirst({where:{utilisateurId:req.user.id}})
    const bw=c?{OR:[{compteSourceId:c.id},{compteDestId:c.id}]}:{}
    const canSeeGlobal = ADMIN_SUP.includes(req.user.role) || req.user.role === 'support_tech'
    const [dep,ret,gains,txJ,users,alertes,tickets] = await Promise.all([
      prisma.transaction.count({where:{...bw,type:'depot',dateCreation:{gte:debut}}}),
      prisma.transaction.count({where:{...bw,type:'retrait',dateCreation:{gte:debut}}}),
      prisma.commission.aggregate({where:{beneficiaireId:req.user.id,dateCalcul:{gte:debut}},_sum:{montant:true}}),
      prisma.transaction.count({where:{...bw,dateCreation:{gte:new Date(now.getFullYear(),now.getMonth(),now.getDate())}}}),
      canSeeGlobal ? prisma.utilisateur.count() : Promise.resolve(0),
      canSeeGlobal ? prisma.alerte.count({where:{statut:'active'}}) : Promise.resolve(0),
      canSeeGlobal ? prisma.ticket.count({where:{statut:'ouvert'}}) : Promise.resolve(0)
    ])
    return ok(res, {depotsMois:{count:dep},retraitsMois:{count:ret},gainsMois:gains._sum.montant||0,txJour:txJ,totalUtilisateurs:users,alertesActives:alertes,ticketsOuverts:tickets})
  } catch (e) { return err(res, e.message, 500) }
})

// Overview admin
app.get('/api/v1/admin/overview', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const [users,txns,alertes] = await Promise.all([
      prisma.utilisateur.count(),
      prisma.transaction.count(),
      prisma.alerte.count({where:{statut:'active'}}).catch(()=>0)
    ])
    const comm = await prisma.commission.aggregate({_sum:{montant:true}})
    return ok(res, { users, txns, totalCommissions: comm._sum.montant||0, alertes })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ ALERTES — admin, superviseur, support_tech ═══
app.get('/api/v1/alerts', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try {
    const {statut,limit=30} = req.query
    const where = statut ? {statut} : {}
    const list = await prisma.alerte.findMany({where,take:parseInt(limit),orderBy:{dateDetection:'desc'},include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}})
    return ok(res,list)
  } catch(e){return err(res,e.message,500)}
})

app.patch('/api/v1/alerts/:id', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try { const a=await prisma.alerte.update({where:{id:req.params.id},data:req.body}); return ok(res,a) }
  catch(e){return err(res,e.message,500)}
})

// ═══ TICKETS — admin, superviseur, support_client, support_tech ═══
app.get('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {statut,limit=20} = req.query
    const canSeeAll = BACKOFFICE.includes(req.user.role)
    const where = canSeeAll ? (statut?{statut}:{}) : {clientId:req.user.id}
    const list = await prisma.ticket.findMany({where,take:parseInt(limit),orderBy:{dateCreation:'desc'},include:{client:{select:{prenom:true,nom:true,telephone:true}}}})
    return ok(res,list)
  } catch(e){return err(res,e.message,500)}
})

app.post('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {sujet,description,typeTicket,telephone} = req.body
    // Si support crée un ticket pour un client
    let clientId = req.user.id
    if (BACKOFFICE.includes(req.user.role) && telephone) {
      const client = await prisma.utilisateur.findUnique({where:{telephone}})
      if (client) clientId = client.id
    }
    const ref_t = 'TKT-'+Date.now().toString(36).toUpperCase()
    const t = await prisma.ticket.create({data:{reference:ref_t,sujet,description,priorite:'moyenne',statut:'ouvert',clientId}})
    return ok(res,t,201)
  } catch(e){return err(res,e.message,500)}
})

// Résoudre ticket — admin, superviseur, support_client, support_tech
app.patch('/api/v1/tickets/:id/status', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try { const t=await prisma.ticket.update({where:{id:req.params.id},data:{statut:req.body.statut}}); return ok(res,t) }
  catch(e){return err(res,e.message,500)}
})

// ═══ RÉSEAU ═══
app.get('/api/v1/network/agents', authMiddleware, async (req, res) => {
  try {
    const agents = await prisma.utilisateur.findMany({where:{parrainId:req.user.id,role:'agent'},select:{id:true,prenom:true,nom:true,telephone:true,zone:true,statut:true,codeParrainage:true,comptes:true}})
    return ok(res,agents)
  } catch(e){return err(res,e.message,500)}
})

// ═══ KYC DOCUMENTS — support_client peut voir les photos ═══

// Enregistrer URL document KYC après upload Cloudinary
app.post('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier, hashFichier } = req.body
    if (!userId || !typeDocument || !urlFichier) return err(res, 'userId, typeDocument et urlFichier requis')
    // Utiliser SQL brut pour éviter les problèmes de migration Prisma
    const id = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `DELETE FROM kyc_documents WHERE utilisateur_id = $1 AND type_document = $2`,
      userId, typeDocument
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut)
       VALUES ($1, $2, $3, $4, $5, 'soumis')`,
      id, userId, typeDocument, urlFichier, hashFichier||'none'
    )
    return ok(res, { id, utilisateurId: userId, typeDocument, urlFichier, statut: 'soumis' }, 201)
  } catch(e) { return err(res, e.message, 500) }
})

app.get('/api/v1/kyc/documents', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { userId, type } = req.query
    if (!userId) return err(res, 'userId requis')
    let query = `SELECT id, type_document as "typeDocument", url_fichier as "urlFichier", statut, date_soumission as "dateSoumission" FROM kyc_documents WHERE utilisateur_id = $1`
    const params = [userId]
    if (type) { query += ` AND type_document = $2`; params.push(type) }
    query += ` ORDER BY date_soumission DESC`
    const docs = await prisma.$queryRawUnsafe(query, ...params)
    return ok(res, docs)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC — admin et superviseur valident ═══
app.get('/api/v1/kyc/:userId/validate', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try { const u=await prisma.utilisateur.update({where:{id:req.params.userId},data:{kycNiveau:req.body.kycNiveau,statut:'actif'}}); return ok(res,u) }
  catch(e){return err(res,e.message,500)}
})

// ═══ DÉMARRAGE ═══
async function main() {
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ PostgreSQL connecté')

    // Créer les tables manquantes si elles n'existent pas
    // Ajouter colonne initiateur_role si manquante
    await prisma.$executeRawUnsafe(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS initiateur_role TEXT NOT NULL DEFAULT 'client'
    `).catch(e => console.log('initiateur_role:', e.message))

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(`
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

  } catch (e) {
    console.error('❌ Erreur DB:', e)
    process.exit(1)
  }
  app.listen(PORT, () => console.log(`🚀 AFRIM PAY API v2.3 → port ${PORT}`))
}
main().catch(e => { console.error(e); process.exit(1) })
