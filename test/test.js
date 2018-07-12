const chatLib = require('../src/index')

let messageInterval

const handlers = {
  onMessageEvent (from, message) {
    console.log(from, 'said', message)
  },
  onStatusEvent (status, detail) {
    console.log('status event', status, detail)
  },
  onPresenceEvent (from, status) {
    console.log('presence event', from, status)
  },
  onPresenceJoined (from) {
    console.log('presence joined', from)
    console.log('participant joined. start sending messages as customer.')
    // check that there is not a current interval set up for sending messages
    if (messageInterval) {
      // clear the current interval
      clearInterval(messageInterval)
    }
    // set up new interval to send messages to agent every 5 seconds
    messageInterval = setInterval(() => {
      this.sendMessage('hi from customer')
    }, 5000)
  },
  onPresenceLeft (from) {
    console.log('presence left', from)
  },
  onLastParticipantLeft () {
    console.log('last participant left')
  },
  onTypingEvent (from, status) {
    console.log('typing event', from, status)
  },
  onTypingStart (from) {
    console.log(from, 'is typing')
  },
  onTypingStop (from) {
    console.log(from, 'stopped typing')
  },
  onOtherEvent (type, ev) {
    console.log('other event', type, ev)
  },
  onAgentTimeout (message) {
    console.log('agent timeout', message)
  },
  onChatCreated () {
    console.log('chat created')
  },
  onStopPolling () {
    console.log('polling stopped')
    // clear our automated cutomer message interval
    clearInterval(messageInterval)
  },
  onSessionExpired () {
    console.log('session expired')
  }
}

const chat = new chatLib({
  urlBase: 'https://sm2-uccx.dcloud.cisco.com/ccp',
  form: 100000,
  csq: 'Chat_Csq28',
  title: 'Facebook Messenger',
  customerName: 'Facebook Messenger',
  author: 'Coty Condry',
  handlers
})

chat.start()
