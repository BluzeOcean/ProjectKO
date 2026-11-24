// The dictation probe. It records what a Project KO window receives when
// another process types into it. It is a diagnostic, not product behaviour.
//
// A development build records by default - a measurement that is never taken
// cannot be read - but a release build records nothing until an agent asks for
// it, so the shipped app is not a silent recorder. The badge stays off the
// screen until somebody asks for it in either build.
//
// The saved choice belongs to the build that made it: a probe left on while
// developing must not follow the owner into the release build, and a probe
// switched on in the release build must not quietly start recording in the
// development build.

/** The name of the build a probe setting belongs to. */
export const probeMode = dev => (dev ? 'dev' : 'release');

/** The state a build starts from, and the state it keeps.
 *  A saved setting from the other build is ignored: it starts from the
 *  default of this build instead. */
export function probeState(saved, mode) {
  if (saved?.mode !== mode) return { recording: mode === 'dev', badge: false, mode };
  return { recording: saved.recording !== false, badge: saved.badge === true, mode };
}
