/* @flow */

import type {SelectionRange} from "./web-annotation-selectors"
import {selectorOf, resolveRangeSelector, getRangeSelector, reduceSelectionRanges} from "./web-annotation-selectors"

interface TargetSelector {
  type:"CssSelector",
  value:string
}

interface Process <error, message> {
  send(payload:message):void,
  panic(reason:error):void
}

interface ProgramConfig <options, message, model> {
  init(config:options):model,
  update(payload:message, state:model):model,
  commands(state:model):Task<empty, message>,
  commit(state:model):model
}

type Task <error, value> =
  (process:Process<error, value>) => void

class Program <options, message, model> {
  config:ProgramConfig<options, message, model>
  state:model
  constructor (config:ProgramConfig<options, message, model>) {
    this.config = config
  }
  send (payload:message) {
    this.transact(this.config.update(payload, this.state))
  }
  transact(state:model) {
    const {commands, commit} = this.config
    const task = commands(state)
    this.state = commit(state)
    task(this)
  }
  panic (error:Error) {
    console.error('Panic! Unexpected error occured', error)
  }
  spawn(settings:options) {
    this.transact(this.config.init(settings))
  }
}


export class Model {
  isAiming:boolean
  target:?TargetSelector
  selections:Array<SelectionRange>
  constructor (isAiming:boolean, target:?TargetSelector, selections:Array<SelectionRange>) {
    this.isAiming = isAiming
    this.target = target
    this.selections = selections
  }
  clone ():self {
    return new Model(this.isAiming, this.target, this.selections)
  }
  merge (patch:$Shape<self>):self {
    return Object.assign(this.clone(), patch)
  }
}


const init = () => new Model(false, null, [])

type Message =
  | { type: 'NoOp' }
  | { type: 'StartAiming' }
  | { type: 'StopAiming' }
  | { type: 'MouseOver', target:TargetSelector }
  | { type: 'MouseOut' }
  | { type: 'Select' }
  | { type: 'SelectionChange', selections:Array<SelectionRange> }

const update = (message:Message, model:Model):Model => {
  switch (message.type) {
    case 'NoOp':
      return model
    case 'StartAiming':
      return model.merge({isAiming: true})
    case 'StopAiming':
      return model.merge({isAiming: false})
    case 'MouseOver':
      return model.merge({target: message.target})
    case 'Select':
      return ( model.isAiming && model.target
        ? model.merge({
            target: null,
            selections: [...model.selections, model.target]
          })
        : model)
    case 'SelectionChange':
      return model.merge({selections: message.selections})
    default:
      console.error(`Unknown message:`, message)
      return model
  }
}


const commands = (model:Model):Task<empty, Message> =>
  (process) =>
  void draw(model)

const commit = (model:Model) => model


export const main:Program<void, Message, Model> = new Program({
  init: init,
  update: update,
  commands: commands,
  commit: commit
})



// --- Renderer
const draw = (state:Model) => {
  const root = document.documentElement
  if (root) {
    const scene =
      document.querySelector(':root > .marker-scene') ||
      drawScene(root)
    const target =
      document.querySelector(':root > .marker-scene > .target') ||
      drawTarget(scene)
    const stateDebugger =
      document.querySelector(':root > .state-debugger') ||
      drawStateDebugger(root)

    renderTarget(target, state.target, state.isAiming)
    renderStateDebugger(stateDebugger, state)
    renderSelections(document, state.selections)
    setListeners(document)
  }
}

const drawScene = (target:Element):HTMLElement => {
  const element = target.ownerDocument.createElement('article')
  element.style.position = 'absolute'
  element.style.pointerEvents = 'none'
  element.style.top = '0'
  element.style.left = '0'
  element.style.width = '100%'
  element.style.height = '100%'
  element.style.zIndex = '99998'
  element.className = 'marker-scene'

  target.appendChild(element)
  return element
}

const drawTarget = (target:HTMLElement):HTMLElement => {
  const element = target.ownerDocument.createElement('section')
  element.style.position = 'absolute'
  element.style.pointerEvents = 'none'
  element.style.backgroundColor = 'yellow'
  element.style.opacity = '0.5'
  element.style.display = 'none'
  element.className = 'target'
  element.style.pointerEvents = 'none'
  target.appendChild(element)
  return element
}

const drawStateDebugger = (target:HTMLElement):HTMLElement => {
  const element = target.ownerDocument.createElement('pre')
  element.style.position = 'fixed'
  element.style.pointerEvents = 'none'
  element.style.top = '0'
  element.style.left = '0'
  element.style.zIndex = '99999'
  element.className = 'state-debugger'
  element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
  element.style.color = 'white'

  target.appendChild(element)
  return element
}

const renderTarget = (element:HTMLElement, target:?TargetSelector, isVisible:boolean) => {
  const aimedElement = !isVisible
    ? null
    : target == null
    ? null
    : element.ownerDocument.querySelector(target.value)

  if (aimedElement) {
    const marker = readTargetRect(aimedElement)
    element.style.height = `${marker.height}px`
    element.style.width = `${marker.width}px`
    element.style.top = `${marker.top + marker.offsetTop}px`
    element.style.left = `${marker.left + marker.offsetLeft}px`
    element.style.display = 'block'
  } else {
    element.style.display = 'none'
  }
}

class Rect {
  width:number
  height:number
  top:number
  left:number
  offsetTop:number
  offsetLeft:number
  constructor (width, height, top, left, offsetTop, offsetLeft) {
    this.width = width
    this.height = height
    this.top = top
    this.left = left
    this.offsetTop = offsetTop
    this.offsetLeft = offsetLeft
  }
}


const readTargetRect = (element:Element):Rect => {
  const {ownerDocument} = element
  const {body, documentElement} = ownerDocument
  const {width, height, top, left} = element.getBoundingClientRect()
  const offsetTop =
    (documentElement ? documentElement.scrollTop : 0) +
    (body ? body.scrollTop : 0)
  const offsetLeft =
    (documentElement ? documentElement.scrollLeft : 0) +
    (body ? body.scrollLeft : 0)

  return new Rect(width,
                 height,
                 top,
                 left,
                 offsetTop,
                 offsetLeft)
}

const renderStateDebugger = (output, state) => {
  output.textContent = JSON.stringify(state, null, 2)
}

const renderSelections = (document, selections) => {
  const selection = document.getSelection()
  const root = document.documentElement
  if (selection && root) {
    // selection.removeAllRanges()
    for (const selector of selections) {
      const range = resolveRangeSelector(selector, root)
      if (range instanceof Error) {
        console.error(range)
      } else {
        selection.addRange(range)
      }
    }
  }
}

const setListeners = (document:Document & {[key:string]:Function}) => {
  document.onkeydown = handleEvent
  document.onkeyup = handleEvent
  document.onmouseover = handleEvent
  document.onmouseout = handleEvent
  document.onmouseup = handleEvent
  document.onselectionchange = handleEvent
}

const handleEvent = event => {
  const message = decode(event)
  if (message != null) {
    main.send(message)
  }
}

const decode = (event:Event & Object):?Message => {
  switch (event.type) {
    case 'keydown':
      return decodeKeyDown(event)
    case 'keyup':
      return decodeKeyUp(event)
    case 'mouseover':
      return decodeMouseOver(event)
    case 'mouseup':
      return decodeMouseUp(event)
    case 'selectionchange':
      return decodeSelectionChange(event)
    default:
      return null
  }
}

const decodeIsAiming = (event:Object):boolean =>
  event.key === 'Meta' ||
  event.keyIdentifier === 'Meta' ||
  event.keyCode === 224


const decodeKeyDown = (event:Object):?Message => {
  if (decodeIsAiming(event)) {
    return { type: "StartAiming" }
  } else {
    return null
  }
}

const decodeKeyUp = (event:Object):?Message => {
  if (decodeIsAiming(event)) {
    return { type: "StopAiming" }
  } else {
    return null
  }
}

const decodeMouseOver = (event:{target:Element}):?Message => {
  return { type: "MouseOver", target: decodeTargetSelector(event.target) }
}

const decodeMouseUp = (event:{target:Element}):?Message => {
  return { type: "Select" }
}

const decodeTargetSelector = (element:Element):TargetSelector =>
  ({ type: "CssSelector", value:selectorOf(element) })




const decodeSelectionChange = (event:{target:Document}):?Message => {
  const selection = event.target.getSelection()
  if (selection) {
    const selectors = reduceSelectionRanges(
      (selectors, range) => {
        if (!range.collapsed) {
          selectors.push(getRangeSelector(range))
        }
        return selectors
      },
      selection,
      [])

    return { type: "SelectionChange", selections: selectors }
  }
}
