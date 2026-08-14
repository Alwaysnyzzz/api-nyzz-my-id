// HikariEngine/HikariMenu.js
//
// "Otak" sistem menu: baca subfolder kategori di HikariCase/ dan HikariPlugin/,
// lalu susun & KIRIM menu .menu (utama) dan .menu <kategori> — termasuk foto,
// tombol interaktif WhatsApp (native flow), dan fake-quoted.
//
// Kategori & isi menu DIBACA OTOMATIS dari nama folder/file di
// HikariCase/HikariPlugin, pakai satu command `.menu <kategori>` (spasi).
// Tambah command baru = otomatis update, nggak perlu edit teks menu manual.
//
// Aturan folder yang dipakai:
// - Subfolder langsung di dalam HikariCase/ atau HikariPlugin/ = nama kategori.
// - Nama file .js di dalamnya (tanpa ".js") = nama command yang tampil di menu.

const fs = require("fs")
const path = require("path")

const HikariStorage = require("./HikariStorage")
const HikariMenuMode = require("./HikariMenuMode")
const { getQuotedV1, getQuotedV2, getQuotedV3 } = require("./HikariReply")

const CASE_DIR = "HikariCase"
const PLUGIN_DIR = "HikariPlugin"

// ============================================================
// Emoji per kategori (nama folder) — tinggal isi di sini kalau mau
// emoji khusus untuk kategori tertentu. Nama key harus sama persis
// dengan nama folder di HikariCase/ atau HikariPlugin/ (huruf kecil
// semua, karena dicocokkan pakai .toLowerCase()).
//
// Kategori yang TIDAK ada di object ini otomatis pakai emoji
// default 📁 (lihat getCategoryEmoji di bawah) — jadi nambah folder
// kategori baru nggak akan error walau belum didaftarin di sini.
// ============================================================

const CATEGORY_EMOJIS = {
  main: "🧩",
  maker: "🎨",
  owner: "👑",
  group: "👥",
  islami: "🕌",
  tools: "🛠️"
}

const DEFAULT_CATEGORY_EMOJI = "📁"

function getCategoryEmoji(category) {
  const key = String(category || "").toLowerCase()
  return CATEGORY_EMOJIS[key] || DEFAULT_CATEGORY_EMOJI
}

// ============================================================
// Util dasar
// ============================================================

function getPrefixList() {
  if (Array.isArray(global.prefix)) {
    const list = global.prefix.map((p) => String(p).trim()).filter(Boolean)
    return list.length ? list : ["."]
  }

  if (typeof global.prefix === "string" && global.prefix.trim()) {
    return [global.prefix.trim()]
  }

  return ["."]
}

function getPrimaryPrefix() {
  return getPrefixList()[0]
}

function getPrefixText() {
  return getPrefixList().join(" / ")
}

function getBotName() {
  return global.botName || "Hikari"
}

function getBotVersion() {
  if (global.versi) return String(global.versi)

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    return pkg.version || "1.0.0"
  } catch {
    return "1.0.0"
  }
}

function titleCase(text = "") {
  return String(text || "")
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function getOwnerNumber() {
  if (Array.isArray(global.owner_number) && global.owner_number.length) {
    return String(global.owner_number[0]).replace(/[^0-9]/g, "")
  }

  if (global.owner_number) {
    return String(global.owner_number).replace(/[^0-9]/g, "")
  }

  return ""
}

function getOwnerUrl() {
  const number = getOwnerNumber()
  return number ? `https://wa.me/${number}` : null
}

function getMenuYear() {
  return new Date().getFullYear()
}

function getMenuCopyCode() {
  return `${getBotName().toUpperCase()}${getMenuYear()}`
}

function getMenuFooter() {
  return `© ${getMenuYear()} ${getBotName()} • All Rights Reserved`
}

// ============================================================
// Runtime — format "X hari Y jam Z menit"
// ============================================================

function formatDuration(seconds = 0) {
  seconds = Math.floor(Number(seconds) || 0)

  const days = Math.floor(seconds / 86400)
  seconds %= 86400

  const hours = Math.floor(seconds / 3600)
  seconds %= 3600

  const minutes = Math.floor(seconds / 60)
  seconds %= 60

  const result = []

  if (days) result.push(`${days} hari`)
  if (hours) result.push(`${hours} jam`)
  if (minutes) result.push(`${minutes} menit`)
  if (seconds || !result.length) result.push(`${seconds} detik`)

  return result.join(" ")
}

function getRuntimeText() {
  return formatDuration(process.uptime())
}

// ============================================================
// Baca kategori & command dari struktur folder
// ============================================================

function listCategoryDirs(baseDir) {
  const dirPath = path.join(process.cwd(), baseDir)
  if (!fs.existsSync(dirPath)) return []

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function listCommandsInCategory(baseDir, category) {
  const dirPath = path.join(process.cwd(), baseDir, category)
  if (!fs.existsSync(dirPath)) return []

  return fs.readdirSync(dirPath)
    .filter((file) => file.endsWith(".js"))
    .map((file) => file.replace(/\.js$/, ""))
}

function getAllCategories() {
  const categories = new Set([
    ...listCategoryDirs(CASE_DIR),
    ...listCategoryDirs(PLUGIN_DIR)
  ])
  return [...categories].sort()
}

function getCommandsForCategory(category) {
  const commands = new Set([
    ...listCommandsInCategory(CASE_DIR, category),
    ...listCommandsInCategory(PLUGIN_DIR, category)
  ])
  return [...commands].sort()
}

function getTotalFeatureCount() {
  const all = new Set()

  for (const category of getAllCategories()) {
    for (const command of getCommandsForCategory(category)) {
      all.add(command)
    }
  }

  return all.size
}

// ============================================================
// Info user (untuk sapaan "Hai, @user")
// ============================================================

function getUserMention(m = {}) {
  const jid = m.sender || ""
  const number = String(jid).split("@")[0]

  if (number) return `@${number}`
  if (m.pushName) return m.pushName
  if (m.senderNumber) return m.senderNumber

  return "User"
}

function getMentionList(m = {}) {
  return m && m.sender ? [m.sender] : []
}

// ============================================================
// Teks kategori (box mini)
// ============================================================

function buildCategoryBox(category) {
  const prefix = getPrimaryPrefix()
  const commands = getCommandsForCategory(category)

  if (commands.length === 0) return null

  let text = `╭─⧉ 「 ${getCategoryEmoji(category)} Menu ${titleCase(category)} 」───\n`

  for (const command of commands) {
    text += `│✎ ${prefix}${command}\n`
  }

  text += `╰─────────────────`

  return text
}

// ============================================================
// Body dashboard utama
// ============================================================

function buildDashboardBody(m = {}, options = {}) {
  const botName = getBotName()
  const userMention = getUserMention(m)
  const content = options.content || ""
  const readMore = options.readMore ? String.fromCharCode(8206).repeat(4001) : ""

  let text = `╭─⧉ 「 ${botName} 」───\n`
  text += `│ Hai, ${userMention} 👋\n`
  text += `│ Pilih Fitur Dengan Tombol Di Bawah.\n`
  text += `╰─────────────────\n\n`

  text += `╭─⧉ 「 BOT CORE 」───\n`
  text += `│ 🧠 Nama : ${botName}\n`
  text += `│ 🧩 Fitur : ${getTotalFeatureCount()} fitur aktif\n`
  text += `│ 🛡️ Versi : v${getBotVersion()}\n`
  text += `│ 🔑 Prefix : ${getPrefixText()}\n`
  text += `│ 📌 Tampilan Menu : ${HikariMenuMode.getMenuMode().toUpperCase()}\n`
  text += `│ ⏰ Runtime : ${getRuntimeText()}\n`
  text += `╰─────────────────\n`
  text += `${readMore}${content ? `\n\n${content}` : ""}`

  return text
}

// ============================================================
// Tombol interaktif (native flow) — sumber section DIBACA OTOMATIS
// dari folder, bukan ditulis manual. Tap salah satu row di list akan
// mengirim `id`-nya sebagai command, jadi id di sini langsung
// ".menu <kategori>" (format command kita).
// ============================================================

// ============================================================
// Kirim menu — 3 versi tampilan (diatur .setmenu v1/v2/v3, lihat
// HikariEngine/HikariMenuMode.js). PENTING: quoted di .menu ini TERPISAH
// dari global.modereply (yang ngatur m.reply buat pesan SELAIN .menu) —
// tiap versi .menu punya fake-quoted SENDIRI yang FIXED, gak ikut ganti-
// ganti kalau global.modereply diubah:
//
// v1 = quoted kontak AI          → getQuotedV1()
// v2 = quoted kartu produk toko  → getQuotedV2()
// v3 = quoted kartu troli/keranjang → getQuotedV3() —
//      thumbnail-nya FOTO PROFIL PENGIRIM (bukan foto bot), fallback ke
//      default-profil.jpg kalau gagal diambil.
//
// Tombol/list interaktif (native flow) TETAP ADA di v1, v2, MAUPUN v3 —
// yang beda cuma quoted-nya + media header (v1 & v2 pakai foto, v3 pakai
// video gifPlayback).
// ============================================================

function buildMenuSections() {
  const prefix = getPrimaryPrefix()
  const categories = getAllCategories()

  const mainRows = [
    {
      title: "📖 Menu Utama",
      description: "Tampilkan ulang dashboard & BOT CORE",
      id: `${prefix}menu`
    }
  ]

  const categoryRows = categories.map((category) => {
    const total = getCommandsForCategory(category).length

    return {
      title: `${getCategoryEmoji(category)} Menu ${titleCase(category)}`,
      description: `${total} fitur tersedia di kategori ini`,
      id: `${prefix}menu ${category}`
    }
  })

  const sections = [
    {
      title: "📌 Menu Utama",
      highlight_label: "Populer",
      rows: mainRows
    }
  ]

  if (categoryRows.length > 0) {
    sections.push({
      title: "📂 Kategori Fitur",
      rows: categoryRows
    })
  }

  return sections
}

function buildMenuButtons() {
  const botName = getBotName()
  const websiteUrl = global.websiteUrl
  const saluranUrl = global.linkSaluran
  const ownerUrl = getOwnerUrl()

  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({ has_multiple_buttons: true })
    },
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "📂 Daftar Fitur",
        sections: buildMenuSections(),
        has_multiple_buttons: true
      })
    }
  ]

  // Tombol berikut hanya muncul kalau config-nya diisi — supaya tidak crash
  // kalau global.websiteUrl / global.linkSaluran belum diisi di HikariConfig.js.
  if (websiteUrl) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: "🌐 Website Owner",
        url: websiteUrl,
        merchant_url: websiteUrl,
        has_multiple_buttons: true
      })
    })
  }

  if (saluranUrl) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: `📢 Channel ${botName}`,
        url: saluranUrl,
        merchant_url: saluranUrl,
        has_multiple_buttons: true
      })
    })
  }

  buttons.push({
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: "📋 Copy Code",
      id: "copy_hikari_code",
      copy_code: getMenuCopyCode(),
      has_multiple_buttons: true
    })
  })

  if (ownerUrl) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: `👑 Owner ${botName}`,
        url: ownerUrl,
        merchant_url: ownerUrl
      })
    })
  }

  return buttons
}

function buildNativeParams() {
  const botName = getBotName()
  const url = global.linkSaluran || getOwnerUrl() || "https://wa.me"

  return {
    limited_time_offer: {
      text: `🚀 ${botName} Multidevice ✨`,
      url
    },
    bottom_sheet: {
      in_thread_buttons_limit: 1,
      divider_indices: [1, 2, 3, 4],
      list_title: `Menu ${botName}`,
      button_title: "📌 Buka Menu"
    },
    tap_target_configuration: {
      title: `Menu ${botName}`,
      description: "Pilih menu atau tombol lainnya",
      canonical_url: url,
      domain: "whatsapp.com",
      button_index: 0
    },
    copy_code_config: {
      code: getMenuCopyCode()
    }
  }
}

function buildContextInfo(m = {}) {
  const contextInfo = {
    mentionedJid: getMentionList(m),
    forwardingScore: 999,
    isForwarded: true
  }

  const ownerNumber = getOwnerNumber()
  if (ownerNumber) {
    contextInfo.businessMessageForwardInfo = {
      businessOwnerJid: `${ownerNumber}@s.whatsapp.net`
    }
  }

  if (global.namaSaluran && global.idSaluran) {
    contextInfo.forwardedNewsletterMessageInfo = {
      newsletterName: global.namaSaluran,
      newsletterJid: global.idSaluran
    }
  }

  return contextInfo
}

// ============================================================
// Kirim menu — foto/video + tombol interaktif + fake-quoted.
// ============================================================

// ============================================================
// Builder interaktif (native flow) — dipakai bertiga oleh v1/v2/v3, cuma
// beda quoted & media header. Tombol/list-nya SELALU ada di ketiga versi.
// ============================================================

async function sendInteractiveMenu(hikari, jid, m, bodyText, { quoted, media, mediaType = "image" }) {
  const core = global.hikariCore

  if (!core || typeof core.prepareWAMessageMedia !== "function") {
    throw new Error("global.hikariCore belum tersedia (harusnya di-set otomatis oleh HikariIndex.js).")
  }

  const { prepareWAMessageMedia, generateWAMessageFromContent, proto } = core

  const preparedMedia = await prepareWAMessageMedia(media, { upload: hikari.waUploadToServer })

  const header = { hasMediaAttachment: true }
  if (mediaType === "video") {
    header.videoMessage = preparedMedia.videoMessage
  } else {
    header.imageMessage = preparedMedia.imageMessage
  }

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: getMenuFooter() }),
            header: proto.Message.InteractiveMessage.Header.create(header),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              messageParamsJson: JSON.stringify(buildNativeParams()),
              buttons: buildMenuButtons()
            }),
            contextInfo: buildContextInfo(m)
          })
        }
      }
    },
    { quoted }
  )

  await hikari.relayMessage(jid, msg.message, { messageId: msg.key.id })
}

// v1 = foto + tombol interaktif, quoted kontak AI (fixed, gak ikut modereply).
async function sendMenuV1(hikari, jid, m, bodyText) {
  await sendInteractiveMenu(hikari, jid, m, bodyText, {
    quoted: getQuotedV1(),
    media: { image: HikariStorage.getMenuImageBuffer() },
    mediaType: "image"
  })
}

// v2 = foto + tombol interaktif, quoted kartu produk toko (fixed), foto
// thumbnail-nya pakai foto profil SI PENGIRIM (fallback default-profil.jpg).
async function sendMenuV2(hikari, jid, m, bodyText) {
  await sendInteractiveMenu(hikari, jid, m, bodyText, {
    quoted: await getQuotedV2(hikari, m, { useSenderPhoto: true }),
    media: { image: HikariStorage.getMenuImageBuffer() },
    mediaType: "image"
  })
}

// v3 = video auto-play (gifPlayback) + tombol interaktif, quoted kartu
// troli/keranjang — thumbnail-nya foto profil pengirim (fixed, gak ikut modereply).
async function sendMenuV3(hikari, jid, m, bodyText) {
  const quoted = await getQuotedV3(hikari, m, {
    itemCount: 5,
    message: `❀ Name ${getBotName()}\nᯤ Runtime ${getRuntimeText()}`,
    useSenderPhoto: true
  })

  await sendInteractiveMenu(hikari, jid, m, bodyText, {
    quoted,
    media: { video: HikariStorage.getMenuVideoBuffer(), gifPlayback: true },
    mediaType: "video"
  })
}

async function sendMenu(hikari, jid, m = {}, category = "") {
  const categoryBox = category ? buildCategoryBox(category) : null

  if (category && !categoryBox) {
    await m.reply(`❌ *MENU TIDAK TERSEDIA*\n\n❌ *Kategori Tidak Ditemukan*\n_Silakan pilih kategori menu yang tersedia. Ketik ${getPrimaryPrefix()}menu untuk lihat daftarnya._`)
    return
  }

  const bodyText = buildDashboardBody(m, {
    content: categoryBox,
    readMore: Boolean(categoryBox)
  })

  const mode = HikariMenuMode.getMenuMode()

  if (mode === "v2") {
    await sendMenuV2(hikari, jid, m, bodyText)
    return
  }

  if (mode === "v3") {
    await sendMenuV3(hikari, jid, m, bodyText)
    return
  }

  await sendMenuV1(hikari, jid, m, bodyText)
}

module.exports = {
  getPrefixList,
  getPrimaryPrefix,
  getPrefixText,
  getBotName,
  getBotVersion,

  formatDuration,
  getRuntimeText,

  getAllCategories,
  getCommandsForCategory,
  getTotalFeatureCount,
  getCategoryEmoji,

  getUserMention,
  getMentionList,

  getMenuYear,
  getMenuCopyCode,
  getMenuFooter,

  buildCategoryBox,
  buildDashboardBody,
  buildMenuSections,
  buildMenuButtons,
  buildNativeParams,
  buildContextInfo,

  sendMenu
}
