class Model {
  constructor (isShiftPressed=false, marker=null, selection=null) {
    this.isShiftPressed = isShiftPressed
    this.marker = marker
    this.selection = selection
    this.tasks = []
  }
  clone () {
    const instance = new this.constructor()
    Object.keys(this).forEach(key => instance[key] = this[key])
    return instance
  }
  merge (changes) {
    return Object.assign(this.clone(), changes)
  }
  fx (task) {
    const instance = this.clone()
    instance.tasks = [...this.tasks, task]
    return instance
  }
  transact (process) {
    if (this.tasks.length > 0) {
      this.tasks.forEach(task => new Promise(task).then(process.send, process.report))
      const instance = this.clone()
      instance.tasks = []
      return instance
    }
    return this
  }
}

const init = () => new Model()

const report = (model, error) => model.fx((succeed, fail) => console.error(error))

const update = (message, state) => {
  switch (message.type) {
    case 'NoOp':
      return state
    case 'PressShift':
      return pressShift(state)
    case 'ReleaseShift':
      return releaseShift(state)
    case 'MouseOver':
      return hover(state, message.rect)
    case 'MouseOut':
      return hout(state, message.rect)
    case 'Click':
      return click(state)
    default:
      return report(state, `Unknown message: ${JSON.stringify(message)}`)
  }
}

const drawScene = (target) => {
  const element = target.ownerDocument.createElement('article')
  element.style.position = 'absolute'
  element.style.pointerEvents = 'none'
  element.style.top = 0
  element.style.left = 0
  element.style.width = '100%'
  element.style.height = '100%'
  element.style.zIndex = 99998
  element.className = 'marker-scene'

  target.appendChild(element)
  return element
}

const drawMarker = (target) => {
  const element = target.ownerDocument.createElement('section')
  element.style.position = 'absolute'
  element.style.pointerEvents = 'none'
  element.style.backgroundColor = 'yellow'
  element.style.opacity = 0.5
  element.style.display = 'none'
  element.className = 'marker'
  element.style.ponterEvents = 'none'
  target.appendChild(element)
  return element
}

const drawStateDebugger = (target) => {
  const element = target.ownerDocument.createElement('pre')
  element.style.position = 'fixed'
  element.style.pointerEvents = 'none'
  element.style.top = 0
  element.style.left = 0
  element.style.zIndex = 99999
  element.className = 'state-debugger'
  element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
  element.style.color = 'white'

  target.appendChild(element)
  return element
}

const renderSelection = (document, state) => {
  if (state != null) {
    const selection = document.getSelection()
    const {documentElement, body} = document
    const left = state.left + state.offsetLeft - (documentElement.scrollLeft + body.scrollLeft)
    const top = state.top + state.offsetTop - (documentElement.scrollTop + body.scrollTop)
    const node = document.elementFromPoint(left, top)

    if (node != null) {
      const range = document.createRange()
      try {
        selection.removeAllRanges()
        range.selectNode(node)
        selection.addRange(range)
      } catch (error) {
        console.error(node, error)
      }
    }
  }
}

const renderStateDebugger = (output, state) => {
  output.textContent = JSON.stringify(state, 2, 2)
}

const renderMarker = (element, marker, isVisible) => {
  element.style.height = `${marker.height}px`
  element.style.width = `${marker.width}px`
  element.style.top = `${marker.top + marker.offsetTop}px`
  element.style.left = `${marker.left + marker.offsetLeft}px`
  element.style.display = isVisible
   ? 'block'
   : 'none'
}

const draw = (state) => {
  const scene =
    document.querySelector(':root > .marker-scene') ||
    drawScene(document.documentElement)
  const marker =
    document.querySelector(':root > .marker-scene > .marker') ||
    drawMarker(scene)
  const stateDebugger =
    document.querySelector(':root > .state-debugger') ||
    drawStateDebugger(document.documentElement)

  renderMarker(marker, state.marker, state.isShiftPressed)
  renderStateDebugger(stateDebugger, state)
  renderSelection(document, state.selection)
}

const hover = (state, rect) => state.merge({marker: rect})
const hout = (state, rect) => state
const pressShift = state => state.merge({isShiftPressed: true})
const releaseShift = state => state.merge({isShiftPressed: false})
const click = state =>
  state.isShiftPressed
  ? state.merge({selection: state.marker})
  : state

class Program {
  constructor () {
    this.state = init().transact(this)
  }
  send (message) {
    const before = this.state
    try {
      this.state = update(message, this.state).transact(this)
    } catch (error) {
      this.report(error)
    }

    if (before !== this.state) {
      draw(this.state)
      console.log(this.state)
    }
  }
  report (error) {
    console.error('Unhandled error occured', error)
  }
}

const program = new Program()

const isShiftKey = event =>
  event.key === 'Meta' ||
  event.keyIdentifier === 'Meta' ||
  event.keyCode === 224

class Rect {
  constructor (width, height, top, left, offsetTop, offsetLeft) {
    this.width = width
    this.height = height
    this.top = top
    this.left = left
    this.offsetTop = offsetTop
    this.offsetLeft = offsetLeft
  }
}

const readTargetRect = element => {
  const {ownerDocument} = element
  const {body, documentElement} = ownerDocument
  const {width, height, top, left} = element.getBoundingClientRect()
  return new Rect(width,
                 height,
                 top,
                 left,
                 documentElement.scrollTop + body.scrollTop,
                 documentElement.scrollLeft + body.scrollLeft)
}

if (window.decoders == null) {
  window.decoders = {}
}

decoders.keydown = (event) => {
  console.log(event)
  if (isShiftKey(event)) {
    return {type: 'PressShift'}
  } else {
    return {type: 'NoOp'}
  }
}

decoders.keyup = (event) => {
  if (isShiftKey(event)) {
    return {type: 'ReleaseShift'}
  } else {
    return {type: 'NoOp'}
  }
}

decoders.mouseover = ({target}) => {
  return { type: 'MouseOver', rect: readTargetRect(target) }
}

decoders.mouseout = ({target}) => {
  return { type: 'MouseOut', rect: readTargetRect(target) }
}

decoders.mouseup = _ => {
  return { type: 'Click' }
}

decoders.handleEvent = (event) => {
  const decoder = decoders[event.type]
  if (decoder) {
    program.send(decoder(event))
  }
}

document.onkeydown = decoders.handleEvent
document.onkeyup = decoders.handleEvent
document.onmouseover = decoders.handleEvent
document.onmouseout = decoders.handleEvent
document.onmouseup = decoders.handleEvent
