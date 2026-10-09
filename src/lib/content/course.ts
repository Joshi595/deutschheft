import type { ExerciseRef, LevelSummary, MissionSummary } from './types';

/**
 * What the home and progress pages know about the course: enough to recommend
 * the next step and to count progress, nothing to render a lesson with. It is
 * written into the page once as JSON instead of being passed as component
 * props, which keeps those pages small.
 */

export interface CourseLesson {
  key: string;
  href: string;
  title: string;
  summary: string;
  minutes: number;
  unit: number;
  exercises: ExerciseRef[];
}

export interface CourseUnit {
  number: number;
  title: string;
  checkpointHref?: string;
  checkpointId?: string;
}

export interface CourseLevel {
  id: string;
  title: string;
  name: string;
  href: string;
  status: 'active' | 'planned';
  units: CourseUnit[];
  lessons: CourseLesson[];
  exams: { id: string; href: string; title: string; minutes: number }[];
}

export interface Course {
  levels: CourseLevel[];
  missions: MissionSummary[];
}

export const COURSE_ELEMENT = 'course-data';

export function toCourse(levels: readonly LevelSummary[], missions: readonly MissionSummary[]): Course {
  return {
    levels: levels.map(({ id, title, name, href, status, units, lessons, exams }) => ({
      id,
      title,
      name,
      href,
      status,
      units: units.map(({ number, title, checkpointHref, checkpointId }) => ({ number, title, checkpointHref, checkpointId })),
      lessons: lessons.map(({ key, href, title, summary, minutes, unit, exercises }) => ({ key, href, title, summary, minutes, unit, exercises })),
      exams: exams.map(({ id, href, title, minutes }) => ({ id, href, title, minutes })),
    })),
    missions: missions.map(({ id, href, title, titleDe, level, minutes, icon, objective, lessonKeys, taskIds }) => ({
      id,
      href,
      title,
      titleDe,
      level,
      minutes,
      icon,
      objective,
      lessonKeys,
      taskIds,
    })),
  };
}

/** JSON for a <script type="application/json">. Exercise refs shrink to ["localId", ...tags]. */
export function packCourse(course: Course): string {
  const packed = {
    ...course,
    levels: course.levels.map((level) => ({
      ...level,
      lessons: level.lessons.map((lesson) => ({
        ...lesson,
        exercises: lesson.exercises.map((exercise) => [exercise.id.slice(lesson.key.length + 1), ...exercise.tags]),
      })),
    })),
  };
  // "<" is escaped so no content can close the script element.
  return JSON.stringify(packed).replace(/</g, '\\u003c');
}

export function unpackCourse(json: string): Course {
  const course = JSON.parse(json);
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      lesson.exercises = lesson.exercises.map(([id, ...tags]: string[]) => ({ id: `${lesson.key}.${id}`, tags }));
    }
  }
  return course as Course;
}

let cached: Course | undefined;

/** The course written into the current page. Browser only. */
export function readCourse(): Course {
  cached ??= unpackCourse(document.getElementById(COURSE_ELEMENT)?.textContent ?? '{"levels":[],"missions":[]}');
  return cached;
}
