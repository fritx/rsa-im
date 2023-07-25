import { to } from 'await-to-js'
import { generate } from 'generate-password'
import createHttpError from 'http-errors'
import { createServer } from 'node:http'
import streamToPromise from 'stream-to-promise'
import { Header, Method, Url, dateJson, encrypt } from './common.js'

let storage = {
  userList: [
    /* { username, publicKey, createdAt }, */
  ],
  pendingMessageList: [
    /* { fromUsername, toUsername, text, clientTime, serverTime }, */
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

let validateUsername = username => {

}
let generateSecret = () => {
  return generate({ length: 64, numbers: true, symbols: true })
}

/**
 * services
 */
let signup = (username, publicKey) => {
  validateUsername(username)
  let createdAt = dateJson()
  let user = { username, publicKey, createdAt }
  storage.userList.push(user)
}
let login = username => {
  let target = storage.userList.find(user => {
    return user.username === username
  })
  let rand = String(Math.random())
  let publicKey = target && target.publicKey || rand // fake if not found
  let encrypted = encrypt(rand, publicKey)
  let session = { username, rand, secret: '' }
  memory.sessionList.push(session)
  return encrypted
}
let login1 = (username, decrypted) => {
  let session = memory.sessionList.find(sess => {
    return sess.username === username && sess.rand === decrypted
  })
  if (!session) throw createHttpError(403, 'Handshaking failed')
  let secret = generateSecret()
  Object.assign(session, { secret })
  return { secret }
}
let pull = username => {
  let pending = []
  storage.pendingMessageList.filter(message => {
    if (message.toUsername === username) {
      pending.push(message)
      return false
    }
    return true
  })
  pending.sort((a, b) => {
    return a.clientTime < b.clientTime
  })
  return pending
}
let send = (fromUsername, toUsername, text, clientTime) => {
  let serverTime = dateJson()
  let message = { fromUsername, toUsername, text, clientTime, serverTime }
  storage.pendingMessageList.push(message)
}

/**
 * controllers
 */
let validateLogin = async req => {
  let secret = req.headers[Header.sessionSecret]
  let session = memory.sessionList.find(sess => {
    return sess.secret === secret
  })
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
    signup(username, publicKey)
  } else if (req.method === Method.POST && req.url === Url.login) {
    let { username } = await getPayload(req)
    let encrypted = login(username)
    return { encrypted }
  } else if (req.method === Method.POST && req.url === Url.login1) {
    let { username, decrypted } = await getPayload(req)
    let { secret } = login1(username, decrypted)
    return { secret }
  } else if (req.method === Method.POST && req.url === Url.send) {
    let username = validateLogin(req)
    let { toUsername, text, clientTime } = await getPayload(req)
    send(username, toUsername, text, clientTime)
  } else if (req.method === Method.POST && req.url === Url.pull) {
    let username = validateLogin(req)
    let pending = pull(username)
    return { pending }
  } else {
    throw createHttpError(403, 'req.url invalid')
  }
}
let server = createServer(async (req, res) => {
  let [err, result] = await to(handler(req))
  let status = 200
  if (err) {
    status = 500
    res.writeHead(status, commonHeaders)
    res.end(JSON.stringify({ status, message: String(err) }))
    return
  }
  res.writeHead(status, commonHeaders)
  if (Array.isArray(result)) result = { result } // just in case
  res.end(JSON.stringify({ status, ...result }))
})
server.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/`)
})
