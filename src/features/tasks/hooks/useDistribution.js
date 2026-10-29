// src/features/tasks/hooks/useDistribution.js
// Вынесено из TasksView.jsx — PR1
import { useState, useEffect } from "react";
import { resolveDistributionViaDcEmail } from "../../../tasks/distribution";

export function useDistribution(userOfficeDept) {
  const [distribution, setDistribution] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userOfficeDept.office && !userOfficeDept.department) return;
      const dist = await resolveDistributionViaDcEmail(userOfficeDept.office, userOfficeDept.department);
      if (!cancelled) setDistribution(dist);
    })();
    return () => { cancelled = true; };
  }, [userOfficeDept.office, userOfficeDept.department]);

  return { distribution, setDistribution };
}
