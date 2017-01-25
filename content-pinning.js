 class Model {
  constructor(isShiftPressed=false, target=null) {
    this.isShiftPressed = isShiftPressed
    this.target = target
    this.tasks = []
  }
  clone() {
    const instance = new this.constructor()
    Object.keys(this).forEach(key => instance[key] = this[key])
    return instance
  }
  merge(changes) {
    return Object.assign(this.clone(), changes)
  }
  fx(task) {
    const instance = this.clone()
    instance.tasks = [...this.tasks, task]
    return instance
  }
  transact(process) {
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
    default:
      return report(state, `Unknown message: ${JSON.stringify(message)}`)
  }
}

const drawScene = (root) => {
  const scene = document.createElement('article')
  scene.style.position = 'absolute'
  scene.style.pointerEvents = 'none'
  scene.style.top = 0
  scene.style.left = 0
  scene.style.width = '100%'
  scene.style.height = '100%'
  scene.style.zIndex = 99999
  scene.className = 'marker-scene'

  root.appendChild(scene)
  return scene
}

const drawMarker = (scene) => {
  const marker = document.createElement('section')
  marker.style.position = 'absolute'
  marker.style.pointerEvents = 'none'
  marker.style.backgroundColor = 'yellow'
  marker.style.opacity = 0.5
  marker.style.display = 'none'
  marker.className = 'marker'
  marker.style.ponterEvents = 'none'
  scene.appendChild(marker)
  return marker
}

const draw = (state) => {
  const scene =
    document.querySelector(':root > .marker-scene') ||
    drawScene(document.documentElement)
  const marker =
    document.querySelector(':root > .marker-scene > .marker') ||
    drawMarker(scene)
  
  if (state.isShiftPressed && state.target) {
    marker.style.height = `${state.target.height}px`
    marker.style.width = `${state.target.width}px`
    marker.style.top = `${state.target.top}px`
    marker.style.left = `${state.target.left}px`
    marker.style.display = 'block'
  } else {
    marker.style.display = 'none'
  }
}


const hover = (state, rect) => state.merge({target: rect})
const hout = (state, rect) => state
const pressShift = state => state.merge({isShiftPressed: true})
const releaseShift = state => state.merge({isShiftPressed: false})


program = new class {
  constructor() {
    this.state = init().transact(this)
  }
  send(message) {
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
  report(error) {
    console.error('Unhandled error occured', error)
  }
}

  

isShiftKey = event => event.key === 'Shift' || event.keyIdentifier === 'Shift' || event.keyCode === 16

class Rect {
  constructor(width, height, top, left) {
    this.width = width
    this.height = height
    this.top = top
    this.left = left
  }
}

const readTargetRect = element => {
  const {ownerDocument} = element
  const {body, scrollTop, scrollLeft} = ownerDocument
  const {width, height, top, left} = element.getBoundingClientRect()
  return new Rect(width,
                  height,
                  top + scrollTop + body.scrollTop,
                  left + scrollLeft + body.scrollLeft)
}

if (window.subscribtions == null) {
  window.subscribtions = {}
}

subscribtions.onkeydown = (event) => {
  if (isShiftKey(event)) {
    return {type: "PressShift"}
  } else {
    return {type: "NoOp"}
  }
}

subscribtions.onkeyup = (event) => {
  if (isShiftKey(event)) {
    return {type: "ReleaseShift"}
  } else {
    return {type: "NoOp"}
  }
}


subscribtions.onmouseover = ({target}) => {
  return { type: "MouseOver", rect: readTargetRect(target) }
}

subscribtions.onmouseout = ({target}) => {
  return { type: "MouseOut", rect: readTargetRect(target) }
}

subscribtions.handleEvent = (event) => {
  const decoder = subscribtions[`on${event.type}`]
  if (decoder) {
    program.send(decoder(event))
  }
}

document.addEventListener('keydown', subscribtions, false)
document.addEventListener('keyup', subscribtions, false)
document.addEventListener('mouseover', subscribtions, false)
document.addEventListener('mouseout', subscribtions, false)

