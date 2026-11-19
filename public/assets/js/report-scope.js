'use strict';
// Identitas berasal dari sesi backend, bukan nama pelapor atau isian formulir.
window.ReportScope = {
  owns(report, user) {
    return Boolean(user && typeof user.id === 'string' && user.id && report.ownerId === user.id);
  },
  filter(reports, scope, user) {
    if (scope === 'all') return reports;
    return reports.filter(report => this.owns(report, user));
  }
};
