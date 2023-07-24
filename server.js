import { generate } from 'generate-password'
import { createServer } from 'node:http'
import streamToPromise from 'stream-to-promise'
import { Header, Method, Url } from './common'

let storage = {
  userList: [
    /* { username, publicKey, createdAt }, */
  ],
  pendingMessages: [
    /* { fromUsername, toUsername, text, createdAt }, */
  ],
}
let memory = {
  sessionList: [
    /* { username, rand, secret }, */
  ],
}
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
  let createdAt = new Date().toJSON()
  let user = { username, publicKey, createdAt }
  storage.userList.push(user)
}
let login = (username) => {
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
  if (!session) throw new Error('403: login failed')
  let secret = generateSecret()
  Object.assign(session, { secret })
}
let send = (fromUsername, toUsername, text) => {
  let createdAt = new Date().toJSON()
  let message = { fromUsername, toUsername, text, createdAt }
  storage.messageList.push(message)
}
let pull = username => {
  let pendingList = []
  storage.pendingList.filter(message => {
    if (message.toUsername === username) {
      pendingList.push(message)
      return false
    }
    return true
  })
  return pendingList
}

/**
 * controllers
 */
let validateLogin = async (req) => {
  let secret = req.headers[Header.sessionSecret]
  let session = memory.sessionList.find(sess => {
    return sess.secret === secret
  })
  if (!session) throw new Error('401: please login')
  return session.username
}
let getPayload = async req => {
  let json = await streamToPromise(req)
  return JSON.parse(json)
}
let handler = async (req) => {
  if (req.method === Method.POST && req.url === Url.signup) {
    let { username, publicKey } = await getPayload(req)
    signup(username, publicKey)
  } else if (req.method === Method.POST && req.url === Url.login) {
    let { username } = await getPayload(req)
    return login(username)
  } else if (req.method === Method.POST && req.url === Url.login1) {
    let { username, decrypted } = await getPayload(req)
    login1(username, decrypted)
  } else if (req.method === Method.POST && req.url === Url.send) {
    let fromUsername = validateLogin(req)
    let { toUsername, text } = await getPayload(req)
    send(fromUsername, toUsername, text)
  } else if (req.method === Method.POST && req.url === Url.pull) {
    let username = validateLogin(req)
    return pull(username)
  } else {
    throw new Error('403: req.url invalid')
  }
}
let server = createServer(async (req, res) => {
  let [err, result] = await handler(req)
  if (err) {
    res.writeHead(500, commonHeaders)
    res.end(String(err))
    return
  }
  res.writeHead(200, commonHeaders)
  if (Array.isArray(result)) result = { result }
  res.end(JSON.stringify({ status: 200, ...result }))
})
server.listen(port, () => {
  console.log(`listening at http://localhost:${port}/`)
})
