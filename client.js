import axios from 'axios'
import { Header } from './common'

let storage = {
  messageList: [
    /* { fromUsername, toUsername, text, createdAt }, */
  ],
  sessionSecret: '',
}
let commonHeaders = {
  headers: {
    'content-type': 'application/json',
  },
}
let serverUrl = 'http://localhost:9558'

let post = async (url, data) => {
  let resp = await axios.post(`${serverUrl}${url}`, data, {
    ...commonHeaders,
    [Header.sessionSecret]: storage.sessionSecret,
  })
  return resp.data
}

/**
 * services
 */
let signup = (username, publicKey) => {
  let [publicKey, privateKey] = generateKeyPair()

}
let login = function* (username) {
  let encrypted = yield username
  let decrypted = decrypt(encrypted)
  let resp = yield decrypted
  return resp.status === Enums.success
}

let send = async (toUsername, text) => {
  let data = { toUsername, text }
  let resp = await post('/send', data)
  return resp.status === Enums.success
}
let pull = async (username) => {
  let data = { username, text }
  let { pendingMessages } = await post('/pull', data)
  storage.messageList.push(...pendingMessages)
}
