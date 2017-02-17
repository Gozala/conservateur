/* @flow */

type StringEncodedCSSSelector = string
type XPath = string
type Integer = number
type SerializedSVG = string

type FragmentSpecification =
  | 'http://tools.ietf.org/rfc/rfc3236'
  | 'http://tools.ietf.org/rfc/rfc3778'
  | 'http://tools.ietf.org/rfc/rfc5147'
  | 'http://tools.ietf.org/rfc/rfc3023'
  | 'http://tools.ietf.org/rfc/rfc3870'
  | 'http://tools.ietf.org/rfc/rfc7111'
  | 'http://www.w3.org/TR/media-frags/'
  | 'http://www.w3.org/TR/SVG/'
  | 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html'

type Refinement = {
  refinedBy:?Selector
}

export type Selector =
  & Refinement
  | { type:"CssSelector", value:StringEncodedCSSSelector }
  | { type:"XPathSelector", value:XPath }
  | { type:"TextQuoteSelector", exact:string, prefix:string, suffix:string }
  | { type:"TextPositionSelector", start:Integer, end:Integer }
  | { type:"DataPositionSelector", start:Integer, end:Integer }
  | { type:"SvgSelector", value:SerializedSVG }
  | { type:"RangeSelector", startSelector:Selector, endSelector:Selector }
  | { type:"FragmentSelector", conformsTo:FragmentSpecification, value:string }

const ELEMENT_NODE = 1
const TEXT_NODE = 3

type Indexed <item> = {
  length:number,
  [index:number]: item
}

const indexOfChild = <item> (child:item, children:Indexed<item>):number => {
  const length = children.length
  let index = 0
  while (index < length) {
    if (children[index] === child) {
      return index
    } else {
      index++
    }
  }
  return -1
}

export const selectorOf = (to:Element, from:Element|Document|null=null):string => {
  let target = to
  let selector = ''
  while (from !== target && target != null && target.nodeType === ELEMENT_NODE) {
    if (target.id !== '' && target.id != null) {
      selector = `> #${target.id} ${selector}`
      break
    }

    const parent = target.parentElement
    if (parent != null) {
      const n = indexOfChild(target, parent.children) + 1
      selector = `> ${target.localName}:nth-child(${n}) ${selector}`
    } else {
      selector = `> ${target.localName} ${selector}`
    }
    target = parent
  }

  return selector.substr(2)
}

class RangeSelector <start:Selector, end:Selector, refinement:?Selector> {
  type = 'RangeSelector'
  startSelector:start
  endSelector:end
  refinedBy:refinement
  constructor (startSelector:start, endSelector:end, refinedBy:refinement) {
    this.startSelector = startSelector
    this.endSelector = endSelector
    this.refinedBy = refinedBy
  }
}

class CSSSelector <refinement> {
  type:"CssSelector" = 'CssSelector'
  value:StringEncodedCSSSelector
  refinedBy:refinement
  constructor (value:StringEncodedCSSSelector, refinedBy:refinement) {
    this.value = value
    this.refinedBy = refinedBy
  }
}

class TextPositionSelector <refinement> {
  type:"TextPositionSelector" = 'TextPositionSelector'
  start:Integer
  end:Integer
  refinedBy:refinement
  constructor (start:Integer, end:Integer, refinedBy:refinement) {
    this.start = start
    this.end = end
    this.refinedBy = refinedBy
  }
}

class CursorPositionSelector extends TextPositionSelector <void> {
  constructor (offset:Integer) {
    super(offset, offset)
  }
}

const getCursorPositionSelector = (to:Node, offset:Integer, from:Node):CursorPositionSelector => {
  const document = to.ownerDocument
  const range = document.createRange()
  range.setStart(from, 0)
  range.setEnd(to, offset)
  return new CursorPositionSelector(range.toString().length)
}

const createRangeSelector = (root:Element|Document, commonAncestor:?Element, startContainer:Node, endContainer:Node, startOffset:Integer, endOffset:Integer):SelectionRange => {
  const anchor = commonAncestor == null
    ? root
    : commonAncestor

  const startSelector =
    getCursorPositionSelector(startContainer, startOffset, anchor)
  const endSelector =
    getCursorPositionSelector(endContainer, endOffset, anchor)

  const rangeSelector = new RangeSelector(startSelector, endSelector)

  if (anchor !== root && commonAncestor != null) {
    const commonAncestorSelector = selectorOf(commonAncestor, root)
    return new CSSSelector(commonAncestorSelector, rangeSelector)
  } else {
    return rangeSelector
  }
}

export const toElement =
 (node:Node):?Element => {
   const element = node.nodeType === Node.ELEMENT_NODE /* ::&& node instanceof Element*/
     ? node
     : null
   return element
 }

export const toText =
  (node:Node):?Text => {
    const text = node.nodeType === Node.TEXT_NODE /* ::&& node instanceof Text*/
      ? node
      : null
    return text
  }

export const getRangeSelector = (range:Range):SelectionRange => {
  const {
    commonAncestorContainer,
    startContainer, startOffset,
    endContainer, endOffset
  } = range

  const root = commonAncestorContainer.ownerDocument.documentElement ||
                commonAncestorContainer.ownerDocument
  switch (commonAncestorContainer.nodeType) {
    case TEXT_NODE: {
      const selector =
        createRangeSelector(root,
                            commonAncestorContainer.parentElement,
                            startContainer,
                            endContainer,
                            startOffset,
                            endOffset)
      return selector
    }
    case ELEMENT_NODE: {
      const selector =
        createRangeSelector(root,
                            toElement(commonAncestorContainer),
                            startContainer,
                            endContainer,
                            startOffset,
                            endOffset)
      return selector
    }
    default: {
      const selector =
        createRangeSelector(root,
                            null,
                            startContainer,
                            endContainer,
                            startOffset,
                            endOffset)
      return selector
    }
  }
}

class Break <state> {
  value:state
  constructor (value:state) {
    this.value = value
  }
}

type Step <state> =
  | Break<state>
  | state

type Reducer <state, item> =
  (result:state, input:item) => Step<state>

export const reduceTextNodes = <state>
  (reducer:Reducer<state, Text>, root:Element, seed:state):state => {
  let element:Element = root
  let result:state = seed
  let instruction = result
  let stack:Array<number> = []
  let index = 0
  while (true) {
    const {childNodes} = element
    const {length} = childNodes
    let nodeType = Node.TEXT_NODE
    while (index < length) {
      const child = childNodes[index]
      nodeType = child.nodeType
      index = index + 1

      if (nodeType === Node.TEXT_NODE/* :: && child instanceof Text*/) {
        instruction = reducer(result, child)
        if (instruction instanceof Break) {
          return instruction.value
        } else {
          result = instruction
        }
      }

      if (nodeType === Node.ELEMENT_NODE/* :: && child instanceof Element*/) {
        stack.push(index)
        element = child
        index = 0
        break
      }
    }

      // If loop exited because element node was reach or
      // if loop exited because element had no children
      // resume traversal from the stack.
    if (nodeType === Node.TEXT_NODE || length === 0) {
      const {parentElement} = element
      if (parentElement != null && stack.length > 0) {
        element = parentElement
        index = stack.pop()
      } else {
        break
      }
    }
  }

  return result
}


export const reduceSelectionRanges = <state>
  (reducer:Reducer<state, Range>, selection:Selection, seed:state):state => {
    const count = selection.rangeCount
    let index = 0
    let result = seed
    while (index < count) {
      const range = selection.getRangeAt(index)
      const instruction = reducer(result, range)
      if (instruction instanceof Break) {
        return instruction.value
      } else {
        result = instruction
      }
      index++
    }
    return result
  }

type Anchor = {
  node:Node,
  offset:number
}

const getAnchorsByOffsets =
  (node:Element, offsets:Array<number>):Map<number, Anchor> =>
  reduceTextNodes((state, text) => {
    if (state.offsets.length === 0) {
      return new Break(state)
    } else {
      const offset = state.offsets[0]
      const position = state.position + text.length
      if (position > offset) {
        state.offsets.shift()
        state.map.set(offset, {node: text, offset: offset - state.position})
        state.position = position

        if (state.offsets.length > 0) {
          return state
        } else {
          return new Break(state)
        }
      } else {
        state.position = position
        return state
      }
    }
  }, node, {map: new Map(), offsets: offsets.sort(), position: 0}).map

const getAnchorByOffset =
 (node:Element, offset:number):Anchor|null =>
 reduceTextNodes((state:{position:number, anchor:Anchor|null}, text) => {
   const position = state.position + text.length
   if (position > offset) {
     state.anchor = {node: text, offset: offset - state.position}
     return new Break(state)
   } else {
     state.position = position
     return state
   }
 }, node, {position: 0, anchor: null}).anchor

type RefinedCssSelector <selector> = {
  type:"CssSelector",
  value:string,
  refinedBy:selector
}

type RangedSelector <start, end> = {
  type: "RangeSelector",
  startSelector:start,
  endSelector:end
}

type TextPosition = {
  type:"TextPositionSelector",
  start:Integer,
  end:Integer
}

type MarkerSelector =
  | TextPosition
  | RefinedCssSelector<?MarkerSelector>

export type SelectionRange =
  | TextPosition
  | RefinedCssSelector<SelectionRange>
  | RangedSelector<MarkerSelector, MarkerSelector>

const resolveMarkerSelector = (markerSelector:MarkerSelector, target:Element):Anchor|Error => {
  let selector:?MarkerSelector = markerSelector
  while (selector) {
    switch (selector.type) {
      case 'TextPositionSelector': {
        const anchor = getAnchorByOffset(target, selector.start)
        if (anchor != null) {
          return anchor
        } else {
          return new Error(`No text node found matching ${selector.start} offset`)
        }
      }
      case 'CssSelector': {
        const {refinedBy, value} = selector
        const node = target.querySelector(value)
        if (node != null) {
          target = node
          selector = refinedBy
          continue
        } else {
          return new Error(`No element found matching ${value} query`)
        }
      }
    }
  }
  return new Error(`Unsupported ${JSON.stringify(selector)} selector`)
}

const createRange = (startContainer:Node, startOffset:number, endContainer:Node, endOffset:number):Range|Error => {
  try {
    const range = document.createRange()
    range.setStart(startContainer, startOffset)
    range.setEnd(endContainer, endOffset)
    return range
  } catch (error) {
    return error
  }
}

const resloveRange = (startSelector:MarkerSelector, endSelector:MarkerSelector, commonAncestor:Element):Range|Error => {
  const start = resolveMarkerSelector(startSelector, commonAncestor)
  const end = resolveMarkerSelector(endSelector, commonAncestor)

  if (start instanceof Error) {
    return start
  } else if (end instanceof Error) {
    return end
  } else {
    return createRange(start.node, start.offset, end.node, end.offset)
  }
}

export const resolveRangeSelector =
  (selector:SelectionRange, target:Element):Range|Error => {
    while (selector) {
      switch (selector.type) {
        case 'CssSelector': {
          const commonAncestor = target.querySelector(selector.value)
          if (commonAncestor == null) {
            return new Error(`Node node matching ${selector.value} is found`)
          } else {
            const refinement = selector.refinedBy
            if (refinement == null) {
              const range = commonAncestor.ownerDocument.createRange()
              range.selectNode(commonAncestor)
              return range
            } else {
              switch (refinement.type) {
                case 'TextPositionSelector': {
                  const {start, end} = refinement
                  const anchors =
                        getAnchorsByOffsets(commonAncestor, [start, end])
                  const startAnchor = anchors.get(start)
                  const endAnchor = anchors.get(end)
                  if (startAnchor == null) {
                    return Error(`No text node found matching ${start} offset`)
                  } else if (endAnchor == null) {
                    return Error(`No text node found matching ${end} offset`)
                  } else {
                    return createRange(startAnchor.node,
                                        startAnchor.offset,
                                        endAnchor.node,
                                        endAnchor.offset)
                  }
                }
                case 'RangeSelector': {
                  const {startSelector, endSelector} = refinement
                  return resloveRange(startSelector, endSelector, commonAncestor)
                }
                case 'CssSelector':
                  selector = refinement
                  target = commonAncestor
                  continue
              }
              return Error(`Unsupported ${refinement.type} selector`)
            }
          }
        }
        case 'RangeSelector': {
          const {startSelector, endSelector} = selector
          return resloveRange(startSelector, endSelector, target)
        }
      }
    }
    return new Error(`Unsupported ${selector.type} selector`)
  }
