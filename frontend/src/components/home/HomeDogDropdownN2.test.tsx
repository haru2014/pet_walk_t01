/**
 * [HomeDogDropdownN2 단위 테스트]
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeDogDropdownN2 } from './HomeDogDropdownN2';
import { DEFAULT_DOGS } from '../../types/dogProfile';

describe('HomeDogDropdownN2 - 강아지 선택 드롭다운', () => {
  it('visible이 false이면 아무것도 렌더링하지 않는다', () => {
    const html = renderToStaticMarkup(
      <HomeDogDropdownN2
        visible={false}
        activeDogId={DEFAULT_DOGS[0].id}
        dogs={DEFAULT_DOGS}
        onSelectDog={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('visible이 true이고 다견 등록 시 각 강아지 이름과 체크 표시를 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <HomeDogDropdownN2
        visible={true}
        activeDogId={DEFAULT_DOGS[0].id}
        dogs={DEFAULT_DOGS}
        onSelectDog={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(html).toContain(DEFAULT_DOGS[0].name);
    expect(html).toContain('✓');
    if (DEFAULT_DOGS.length > 1) {
      expect(html).toContain(DEFAULT_DOGS[1].name);
    }
  });
});
