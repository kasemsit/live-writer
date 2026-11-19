import { describe, expect, it } from 'vitest';
import { cropOf, largestBox, parseSynctexView } from './plusSynctex';

// What `synctex view` (TeX Live 2023) printed for a line inside a paper's tikzpicture.
const OUTPUT = `This is SyncTeX command line utility, version 1.5
SyncTeX result begin
Output:/home/u/paper/main.pdf
Page:8
x:43.441174
y:424.532623
h:43.441174
v:424.532623
W:488.692413
H:239.244034
before:
offset:0
middle:
after:
Output:/home/u/paper/main.pdf
Page:8
x:120.0
y:300.0
h:120.0
v:300.0
W:30.5
H:7.2
before:
offset:0
middle:
after:
SyncTeX result end
`;

describe('synctex view', () => {
	it('reads every box it printed', () => {
		expect(parseSynctexView(OUTPUT)).toEqual([
			{ page: 8, h: 43.441174, v: 424.532623, W: 488.692413, H: 239.244034 },
			{ page: 8, h: 120, v: 300, W: 30.5, H: 7.2 },
		]);
		expect(parseSynctexView('SyncTeX result begin\nSyncTeX result end\n')).toEqual([]);
	});

	it('the picture is the largest box; nothing without an area', () => {
		expect(largestBox(parseSynctexView(OUTPUT))?.W).toBeCloseTo(488.69);
		expect(largestBox([{ page: 1, h: 0, v: 0, W: 0, H: 0 }])).toBeNull();
	});

	it('crops the box at the given resolution, with a margin, from the top left', () => {
		const crop = cropOf({ page: 8, h: 43.44, v: 424.53, W: 488.69, H: 239.24 }, 72, 3);
		expect(crop).toEqual({ x: 40, y: 182, width: 495, height: 247 });
	});
});
