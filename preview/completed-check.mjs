// preview/completed-check.mjs — прогон «завершённых» на моке, повторяющем прод:
// • RenderListDataAsStream падает 500, если в ViewFields есть «битое» поле RelatedItems;
// • REST-счётчик падает 400 на substringof.
// Проверяем самовосстановление набора полей и фолбэк счётчика.
import { fetchCompletedCount, fetchCompletedTasksPage } from "../src/tasks/completedTasks";

const show = (label, value) => process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);

const count = await fetchCompletedCount({ currentUserId: 10, distribution: null });
show("счётчик", count);

const page = await fetchCompletedTasksPage({ currentUserId: 10, distribution: null });
show("задач на странице", page.tasks.length);
show("Id задач", page.tasks.map((t) => t.Id));
show("статусы", page.tasks.map((t) => t.Status));

const page2 = await fetchCompletedTasksPage({ currentUserId: 10, distribution: null });
show("повторная загрузка (кеш полей), задач", page2.tasks.length);
