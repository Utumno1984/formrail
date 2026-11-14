// Negative control of the sandbox: the MAIN entry names @formrail/core in its declaration files, so without the
// core installed this must fail to typecheck. If it passes, the sandbox is not really without the core.
import { RebaseNotice } from '@formrail/pro';

export const notice = RebaseNotice;
