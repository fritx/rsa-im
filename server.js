import { to } from 'await-to-js'
import { generate } from 'generate-password'
import createHttpError from 'http-errors'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Writer } from 'steno'
import streamToPromise from 'stream-to-promise'
import { Header, Method, Url, dateJson, encrypt } from './common.js'

let storage = {
  userList: [
    /* { username, publicKey, createdAt }, */
  ],
  pendingMessageList: [
    /* { fromUsername, toUsername, encrypted, clientTime, serverTime }, */
  ],
}
let memory = {
  sessionList: [
    /* { username, rand, secret }, */
  ],
}

/**
 * config
 */
let commonHeaders = {
  'content-type': 'application/json',
}
let port = process.env.PORT || 3008
let __filename = fileURLToPath(import.meta.url)
let __dirname = dirname(__filename)
let Dir = {
  data: resolve(__dirname, 'server_data'),
}
let File = {
  storage: resolve(Dir.data, 'storage.json'),
}
let FileWriter = {
  storage: new Writer(File.storage),
}

/**
 * helpers
 */
let validateUsername = username => {
  let user = storage.userList.find(user => user.username === username)
  if (user) throw createHttpError(403, 'user already taken')
  if (username.length < 2 || username.length > 16) {
    throw createHttpError(403, 'username should be 2~16 characters')
  }
  if (!/^[a-z][a-z0-9]*$/i.test(username)) {
    throw createHttpError(403, 'Each character should be a-z, A-Z or 0-9')
  }
}
let generateSecret = () => {
  return generate({ length: 64, numbers: true, symbols: true })
}
let save = async patch => {
  if (patch) Object.assign(storage, patch)
  await FileWriter.storage.write(JSON.stringify(storage, null, 2))
}

/**
 * services
 */
let signup = async (username, publicKey) => {
  validateUsername(username)
  let createdAt = dateJson()
  let user = { username, publicKey, createdAt }
  storage.userList.push(user)
  await save()
}
let prelogin = username => {
  let target = storage.userList.find(user => user.username === username)
  if (!target) throw createHttpError(404, `user not found: ${username}`)
  let rand = String(Math.random())
  let [, encrypted] = encrypt(target.publicKey, rand)
  let session = { username, rand, secret: '' }
  memory.sessionList.push(session)
  return encrypted
}
let login = (username, decrypted) => {
  let session = memory.sessionList.find(sess => {
    return sess.username === username && sess.rand === decrypted
  })
  if (!session) throw createHttpError(403, 'Handshaking failed')
  let secret = generateSecret()
  Object.assign(session, { secret })
  return { secret }
}
let pull = async username => {
  let pending = []
  let pendingMessageList = storage.pendingMessageList.filter(message => {
    if (message.toUsername === username) {
      pending.push(message)
      return false
    }
    return true
  })
  await save({ pendingMessageList })
  pending.sort((a, b) => {
    return a.clientTime < b.clientTime
  })
  return pending
}
let send = (fromUsername, toUsername, text, clientTime) => {
  let target = storage.userList.find(item => item.username === toUsername)
  if (!target) throw createHttpError(404, `user not found: ${toUsername}`)
  let [, encrypted] = encrypt(target.publicKey, text)
  let serverTime = dateJson()
  let message = { fromUsername, toUsername, encrypted, clientTime, serverTime }
  storage.pendingMessageList.push(message)
}

/**
 * controllers
 */
let validateLogin = req => {
  let secret = req.headers[Header.sessionSecret]
  let session = memory.sessionList.find(sess => sess.secret === secret)
  if (!session) throw createHttpError(401, 'Please log in')
  return session.username
}
let getPayload = async req => {
  let json = await streamToPromise(req)
  return JSON.parse(json)
}
let handler = async req => {
  if (req.method === Method.POST && req.url === Url.signup) {
    let { username, publicKey } = await getPayload(req)
    await signup(username, publicKey)
  } else if (req.method === Method.POST && req.url === Url.prelogin) {
    let { username } = await getPayload(req)
    let encrypted = prelogin(username)
    return { encrypted }
  } else if (req.method === Method.POST && req.url === Url.login) {
    let { username, decrypted } = await getPayload(req)
    let { secret } = login(username, decrypted)
    return { secret }
  } else if (req.method === Method.POST && req.url === Url.send) {
    let username = validateLogin(req)
    let { toUsername, text, clientTime } = await getPayload(req)
    send(username, toUsername, text, clientTime)
  } else if (req.method === Method.POST && req.url === Url.pull) {
    let username = validateLogin(req)
    let pending = await pull(username)
    return { pending }
  } else {
    throw createHttpError(403, 'req.url invalid')
  }
}
let server = createServer(async (req, res) => {
  let [err, result] = await to(handler(req))
  let status = 200
  if (err) {
    status = err && err.status || 500
    console.error('res', req.method, req.url, status, err)
    res.writeHead(200, commonHeaders) // fixed status 200
    res.end(JSON.stringify({ status, message: err.message || String(err) }))
    return
  }
  console.log('res', req.method, req.url, status, result)
  if (Array.isArray(result)) result = { result } // just in case
  res.writeHead(200, commonHeaders)
  res.end(JSON.stringify({ status, ...result }))
})

/**
 * server main
 */
let initStorage = async () => {
  let json = await readFile(File.storage, 'utf8')
  Object.assign(storage, JSON.parse(json))
}
let handleError = err => {
  let status = err && err.status || 500
  let hideStack = /^4\d\d$/.test(status)
  console.log()
  console.error(hideStack ? String(err) : err)
  console.log()
}
process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
let main = async () => {
  setInterval(async () => {
    // ...
  }, 1000 * 10)
  // storage init
  let [err] = await to(initStorage())
  if (err) await to(mkdir(Dir.data)) // err ignored
  // server listen
  server.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`)
  })
}
main()
