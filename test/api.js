/* @flow */

import * as conservateur from '../'
import test from 'tape'

test('test baisc', test => {
  test.isEqual(typeof (conservateur), 'object')
  test.end()
})
