import { constants, privateDecrypt, publicEncrypt } from 'node:crypto'

export let Header = {
  sessionSecret: 'x-session-secret',
}
export let Method = {
  POST: 'POST',
}
export let Url = {
  signup: '/signup',
  prelogin: '/prelogin',
  login: '/login',
  send: '/send',
  pull: '/pull',
}

export let dateJson = () => new Date().toJSON()

export let encrypt = (publicKey, value) => {
  return publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, value).toString('base64')
}
export let decrypt = (privateKey, value) => {
  let buffer = Buffer.from(value, 'base64')
  return privateDecrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, buffer).toString()
}
