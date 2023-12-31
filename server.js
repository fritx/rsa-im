import { to } from 'await-to-js'
import { generate } from 'generate-password'
import createHttpError from 'http-errors'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Writer } from 'steno'
import streamToPromise from 'stream-to-promise'
import { Header, Method, Url, commonHeaders, dateJson, encrypt, formatError, getMessageId, init, uuid } from './common.js'

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
    /* { username, nonce, secret }, */
  ],
}
let migrate = () => {
  // ...
}

/**
 * config
 */
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
let textLimit = 200

/**
 * helpers
 */
let validateDateJson = json => {
  return new Date(json).toJSON() === json
}
let validateUsername = username => {
  let user = storage.userList.find(user => user.username === username)
  if (user) throw createHttpError(403, `User already taken: ${username}`)
  if (username.length < 2 || username.length > 16) {
    throw createHttpError(400, 'username should be 2~16 characters')
  }
  if (!/^[a-z][a-z0-9]*$/i.test(username)) {
    throw createHttpError(400, 'Each character should be a-z, A-Z or 0-9')
  }
}
let matchClientMessageDuplicate = props => record => {
  return getMessageId(record) === getMessageId(props)
}
let validateClientMessage = (fromUsername, toUsername, text, clientTime, serverTime) => {
  // validating message.text
  if (text.length <= 0) throw createHttpError(400, 'message.text is required')
  if (text.length > textLimit) {
    throw createHttpError(400, `message.text.length should be less than ${textLimit}`)
  }
  // validating message.clientTime
  if (!validateDateJson(clientTime)) throw createHttpError(403, 'message.clientTime invalid')
  let { pendingMessageList } = storage
  let matcher = matchClientMessageDuplicate({ fromUsername, toUsername, serverTime })
  let duplicate = pendingMessageList.find(matcher)
  if (duplicate) throw createHttpError(403, 'messageId duplicated')
  // validating message.toUsername
  let target = storage.userList.find(item => item.username === toUsername)
  if (!target) throw createHttpError(404, `User not found: ${toUsername}`)
  return target.publicKey
}
let generateSecret = () => {
  return generate({ length: 64, numbers: true, symbols: true })
}
let save = async patch => {
  if (patch) Object.assign(storage, patch)
  await FileWriter.storage.write(JSON.stringify(storage, null, 2))
}
let hidden = '******'
let hideSecrets = result => {
  if (!result) return
  ;['secret', 'encrypted'].forEach(key => {
    if (key in result) result[key] = hidden
    Object.keys(result).forEach(k => {
      if (Array.isArray(result[k])) {
        result[k].forEach(item => {
          if (item && key in item) item[key] = hidden
        })
      }
    })
  })
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
  if (!target) throw createHttpError(404, `User not found: ${username}`)
  let nonce = uuid()
  let [, encrypted] = encrypt(target.publicKey, nonce)
  let session = { username, nonce, secret: '' }
  memory.sessionList.push(session)
  return encrypted
}
let login = (username, decrypted) => {
  let session = memory.sessionList.find(sess => {
    return sess.username === username && sess.nonce === decrypted
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
  pending.sort((a, b) => a.clientTime < b.clientTime)
  return pending
}
let send = async (fromUsername, toUsername, text, clientTime) => {
  let serverTime = dateJson()
  let publicKey = validateClientMessage(fromUsername, toUsername, text, clientTime, serverTime)
  let [, encrypted] = encrypt(publicKey, text)
  let { pendingMessageList } = storage
  let message = { fromUsername, toUsername, encrypted, clientTime, serverTime }
  pendingMessageList.push(message)
  await save()
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
    await send(username, toUsername, text, clientTime)
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
    res.writeHead(200, commonHeaders) // fixed status 200
    res.end(JSON.stringify({ status, message: err.message || String(err) }))
    console.error('res', req.method, req.url, status, formatError(err))
    return
  }
  if (Array.isArray(result)) result = { result } // just in case
  res.writeHead(200, commonHeaders)
  res.end(JSON.stringify({ status, ...result }))
  hideSecrets(result)
  console.log('res', req.method, req.url, status, result)
})

/**
 * server main
 */
let handleError = err => {
  console.log()
  console.error(formatError(err))
  console.log()
}
process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
let schedule = () => {
  // ...
}
let main = async () => {
  setInterval(schedule, 1000 * 10)
  // storage init
  let [err] = await to(init(File, storage, migrate))
  if (err) await to(mkdir(Dir.data)) // err ignored
  // server listen
  server.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`)
  })
}
main()
