import { describe, expect, it } from 'vitest';
import { MAX_NOTICE_LINES, splitCourseNotice } from './CourseNoticeLine';

describe('splitCourseNotice', () => {
  it('서버 안내를 줄 단위로 나누고 빈 줄과 중복을 뺀다', () => {
    expect(splitCourseNotice('산책로가 짧아 최대 약 12분이에요\n\n횡단보도를 2번 건너요\n횡단보도를 2번 건너요'))
      .toEqual(['산책로가 짧아 최대 약 12분이에요', '횡단보도를 2번 건너요']);
  });

  it('안내가 없으면 빈 목록', () => {
    expect(splitCourseNotice(undefined)).toEqual([]);
    expect(splitCourseNotice('')).toEqual([]);
  });

  it('카드에는 앞쪽 안내만 최대 3줄 보여 준다', () => {
    const notice = ['a', 'b', 'c', 'd'].join('\n');
    expect(splitCourseNotice(notice)).toHaveLength(MAX_NOTICE_LINES);
    expect(splitCourseNotice(notice)[0]).toBe('a');
  });
});
