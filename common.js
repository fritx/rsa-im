export let Header = {
  sessionSecret: 'x-session-secret',
}
export let Method = {
  POST: 'POST',
}
export let Url = {
  signup: '/signup',
  login: '/login',
  login1: '/login/1',
  send: '/send',
  pull: '/pull',
}

export let dateJson = () => new Date().toJSON()

export let encrypt = (value, publicKey) => {

}
export let decrypt = (value, privateKey) => {

}
