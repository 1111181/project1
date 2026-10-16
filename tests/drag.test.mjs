import test from 'node:test';
import assert from 'node:assert/strict';

import { dropIndexFor } from '../js/drag.js';

// dropIndexFor 接收一串「按视觉顺序排列的矩形」，返回指针 y 落在第几个位置。
// 返回值范围 0..rects.length，返回 length 表示落在最末。
// 判定依据是「指针是否在某项的中线之上」，所以恰好压在中线上时算在这一项之后。

const rect = (top, height) => ({ top, height });

const three = [rect(0, 40), rect(40, 40), rect(80, 40)];
// 中线分别是 20 / 60 / 100

test('空列表返回 0', () => {
  assert.equal(dropIndexFor([], 100), 0);
});

test('指针在所有中线之上时返回 0', () => {
  assert.equal(dropIndexFor(three, 0), 0);
  assert.equal(dropIndexFor(three, 19.9), 0);
});

test('指针在所有中线之下时返回长度（落在最末）', () => {
  assert.equal(dropIndexFor(three, 100), 3);
  assert.equal(dropIndexFor(three, 9999), 3);
});

test('指针落在相邻两项中线之间时，返回后一项的下标', () => {
  assert.equal(dropIndexFor(three, 30), 1, '介于 20 与 60 之间');
  assert.equal(dropIndexFor(three, 70), 2, '介于 60 与 100 之间');
});

test('指针恰好压在中线上时算在这一项之后', () => {
  assert.equal(dropIndexFor(three, 20), 1, '压在第一项中线上 -> 落在它之后');
  assert.equal(dropIndexFor(three, 60), 2);
  assert.equal(dropIndexFor(three, 100), 3);
});

test('各项高度不同也各按自己的中线判定', () => {
  const uneven = [rect(0, 100), rect(100, 20)];
  // 中线 50 与 110
  assert.equal(dropIndexFor(uneven, 40), 0);
  assert.equal(dropIndexFor(uneven, 60), 1);
  assert.equal(dropIndexFor(uneven, 109), 1);
  assert.equal(dropIndexFor(uneven, 111), 2);
});

test('只有一项时：在中线上方返回 0，下方返回 1', () => {
  const one = [rect(10, 40)]; // 中线 30
  assert.equal(dropIndexFor(one, 29), 0);
  assert.equal(dropIndexFor(one, 31), 1);
});
