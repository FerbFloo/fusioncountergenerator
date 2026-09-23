/**
 * DaVinci Resolve / Fusion Odometer Counter Generator Engine
 * 100% Math & Syntax Compatibility with fusion_counter_generator.py
 */

export function formatNum(x) {
  const n = Number(x);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(6).replace(/\.?0+$/, '');
}

export function tExpr(startFrame, durFrames) {
  return `max(0,min(1,(time-${formatNum(startFrame)})/${formatNum(durFrames)}))`;
}

export function easeExpr(easing, startFrame, durFrames) {
  const T = tExpr(startFrame, durFrames);
  const e = String(easing).toLowerCase().replace(/[-_]/g, '');
  if (e === 'linear' || e === 'none') {
    return T;
  }
  if (e === 'in') {
    return `(${T}*${T}*${T})`;
  }
  if (e === 'out') {
    return `(1-(1-${T})*(1-${T})*(1-${T}))`;
  }
  if (e === 'inout') {
    return `iif(${T}<0.5,4*${T}*${T}*${T},1-4*(1-${T})*(1-${T})*(1-${T}))`;
  }
  throw new Error(`Unknown easing: ${easing}`);
}

export function valueExpr(start, end, easing, startFrame, durFrames) {
  return `(${formatNum(start)}+${formatNum(end - start)}*${easeExpr(easing, startFrame, durFrames)})`;
}

export function wheelExpr(V, i) {
  if (i === 0) return V;
  const M = Math.pow(10, i);
  const F = `floor(${V}/${M})`;
  return `(${F}+max(0,min(1,${V}-${F}*${M}-${M}+1)))`;
}

function _inp(name, value = null, expr = null, src = null, srcOut = 'Output') {
  if (src !== null) {
    return `\t\t\t\t${name} = Input { SourceOp = "${src}", Source = "${srcOut}", },`;
  }
  const parts = [];
  if (value !== null) {
    parts.append ? parts.push(`Value = ${value}`) : parts.push(`Value = ${value}`);
  }
  if (expr !== null) {
    parts.push(`Expression = "${expr}"`);
  }
  return `\t\t\t\t${name} = Input { ${parts.join(', ')}, },`;
}

function _tool(name, toolId, inputs, pos) {
  const out = [
    `\t\t${name} = ${toolId} {`,
    `\t\t\tCtrlWZoom = false,`,
    `\t\t\tNameSet = true,`,
    `\t\t\tInputs = {`
  ];
  out.push(...inputs);
  out.push(`\t\t\t},`);
  out.push(`\t\t\tViewInfo = OperatorInfo { Pos = { ${formatNum(pos[0])}, ${formatNum(pos[1])} } },`);
  out.push(`\t\t},`);
  return out;
}

export function generateSettingContent(options) {
  const {
    start = 0,
    end = 100,
    duration = 5,
    easing = 'inout',
    fps = 25,
    startFrame = 0,
    size = 0.25,
    font = 'Open Sans',
    style = 'Bold',
    color = [1.0, 1.0, 1.0],
    cellFactor = 1.25,
    widthFactor = 0.80,
    softEdge = 0.0,
    aspect = 16.0 / 9.0
  } = options;

  const numStart = Number(start);
  const numEnd = Number(end);
  const numDuration = Number(duration);
  const numFps = Number(fps);

  if (numDuration <= 0) throw new Error('Duration must be > 0.');
  if (numStart < 0 || numEnd < 0) throw new Error('Only positive numbers supported.');
  if (numStart === numEnd) throw new Error('Start and end values must be different.');

  const durFrames = numDuration * numFps;
  const V = valueExpr(numStart, numEnd, easing, startFrame, durFrames);

  const lo = Math.min(numStart, numEnd);
  const hi = Math.max(numStart, numEnd);
  const ndig = Math.max(
    String(Math.floor(hi)).length,
    String(Math.floor(lo)).length,
    1
  );

  const spacing = (widthFactor * size) / aspect;
  const cellH = cellFactor * size;

  const cells = [];
  for (let i = 0; i < ndig; i++) {
    const M = Math.pow(10, i);
    const P = wheelExpr(V, i);
    const nLo = Math.floor(lo / M);
    const nHi = Math.floor(hi / M);
    const x = 0.5 + ((ndig - 1) / 2.0 - i) * spacing;
    const count = nHi - nLo + 1;

    if (count <= 10) {
      for (let n = nLo; n <= nHi; n++) {
        if (i > 0 && n === 0) continue;
        const y = `0.5-(${P}-${formatNum(n)})*${formatNum(cellH)}`;
        cells.push({
          i,
          d: Math.abs(n) % 10,
          key: String(n),
          expr: `Point(${formatNum(x)},${y})`,
          blend: null
        });
      }
    } else {
      for (let d = 0; d < 10; d++) {
        const Q = `(${P}-${d})`;
        const y = `0.5-(${Q}-10*floor(${Q}/10+0.5))*${formatNum(cellH)}`;
        let blend = null;
        if (i > 0 && nLo <= 0 && 0 <= nHi && d === 0) {
          blend = `iif((${d}+10*floor(${Q}/10+0.5))<0.5,0,1)`;
        }
        cells.push({
          i,
          d,
          key: `w${d}`,
          expr: `Point(${formatNum(x)},${y})`,
          blend
        });
      }
    }
  }

  const L = ['{', '\tTools = ordered() {'];

  // Background
  L.push(
    ..._tool(
      'CT_BG',
      'Background',
      [
        _inp('UseFrameFormatSettings', '1'),
        _inp('TopLeftRed', '0'),
        _inp('TopLeftGreen', '0'),
        _inp('TopLeftBlue', '0'),
        _inp('TopLeftAlpha', '0')
      ],
      [-110, -120]
    )
  );

  let prev = 'CT_BG';
  cells.forEach((c, k) => {
    const txt = `CT_Txt_${c.i}_${c.key}`;
    const xfm = `CT_Pos_${c.i}_${c.key}`;
    const mrg = `CT_Mrg_${String(k).padStart(2, '0')}`;
    const yPos = k * 42;

    L.push(
      ..._tool(
        txt,
        'TextPlus',
        [
          _inp('UseFrameFormatSettings', '1'),
          _inp('Font', `"${font}"`),
          _inp('Style', `"${style}"`),
          _inp('StyledText', `"${c.d}"`),
          _inp('Size', formatNum(size)),
          _inp('Red1', formatNum(color[0])),
          _inp('Green1', formatNum(color[1])),
          _inp('Blue1', formatNum(color[2]))
        ],
        [0, yPos]
      )
    );

    L.push(
      ..._tool(
        xfm,
        'Transform',
        [
          _inp('Input', null, null, txt),
          _inp('Center', `{ ${formatNum(0.5)}, 0.5 }`, c.expr)
        ],
        [140, yPos]
      )
    );

    const mergeInputs = [
      _inp('Background', null, null, prev),
      _inp('Foreground', null, null, xfm),
      _inp('PerformDepthMerge', '0')
    ];
    if (c.blend) {
      mergeInputs.unshift(_inp('Blend', '1', c.blend));
    }
    L.push(..._tool(mrg, 'Merge', mergeInputs, [280, yPos]));
    prev = mrg;
  });

  // Mask
  L.push(
    ..._tool(
      'CT_Mask',
      'RectangleMask',
      [
        _inp('Width', '1'),
        _inp('Height', formatNum(cellH)),
        _inp('Center', '{ 0.5, 0.5 }'),
        _inp('SoftEdge', formatNum(softEdge))
      ],
      [280, -190]
    )
  );

  // Window
  L.push(
    ..._tool(
      'CT_Window',
      'Merge',
      [
        _inp('Background', null, null, 'CT_BG'),
        _inp('Foreground', null, null, prev),
        _inp('EffectMask', null, null, 'CT_Mask', 'Mask'),
        _inp('PerformDepthMerge', '0')
      ],
      [420, -120]
    )
  );

  // Out
  L.push(
    ..._tool(
      'CT_Out',
      'Transform',
      [
        _inp('Input', null, null, 'CT_Window'),
        _inp('Center', '{ 0.5, 0.5 }'),
        _inp('Size', '1')
      ],
      [560, -120]
    )
  );

  L.push('\t},');
  L.push('\tActiveTool = "CT_Out"');
  L.push('}');

  return L.join('\n') + '\n';
}

/**
 * JS Evaluator for real-time live odometer preview canvas rendering
 */
export function evaluateEasingProgress(progress, easing) {
  const T = Math.max(0, Math.min(1, progress));
  const e = String(easing).toLowerCase().replace(/[-_]/g, '');
  if (e === 'linear' || e === 'none') return T;
  if (e === 'in') return T * T * T;
  if (e === 'out') return 1 - Math.pow(1 - T, 3);
  if (e === 'inout') {
    return T < 0.5
      ? 4 * T * T * T
      : 1 - 4 * Math.pow(1 - T, 3);
  }
  return T;
}

export function calculateOdometerState(start, end, progress, easing) {
  const normEase = evaluateEasingProgress(progress, easing);
  const currentVal = start + (end - start) * normEase;

  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const ndig = Math.max(
    String(Math.floor(hi)).length,
    String(Math.floor(lo)).length,
    1
  );

  const wheels = [];
  for (let i = 0; i < ndig; i++) {
    const M = Math.pow(10, i);
    let p_i = currentVal;
    if (i > 0) {
      const F = Math.floor(currentVal / M);
      const clampVal = Math.max(0, Math.min(1, currentVal - F * M - M + 1));
      p_i = F + clampVal;
    }
    wheels.push({ digitIndex: i, position: p_i });
  }

  return { currentVal, ndig, wheels };
}

export function buildCliCommand(options) {
  const { start, end, duration, easing, fps, font, size, color } = options;
  const colStr = color ? color.join(',') : '1,1,1';
  return `python3 fusion_counter_generator.py --start ${start} --end ${end} --duration ${duration} --easing ${easing} --fps ${fps} --font "${font}" --size ${size} --color "${colStr}" -o counter_${start}_${end}.setting`;
}
