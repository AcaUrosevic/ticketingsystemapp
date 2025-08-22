
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import useAuth from "../hooks/useAuth";
import TaskModal from "../components/TaskModal";
import Pagination from "../components/Pagination";
import Breadcrumbs from "../components/Breadcrumbs";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [project, setProject] = useState(null);

  
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskErr, setTaskErr] = useState("");
  const [taskFilter, setTaskFilter] = useState({ q: "", status: "" });
  const [openTaskId, setOpenTaskId] = useState(null);

  
  const [sortKey, setSortKey] = useState("created_at"); 
  const [sortDir, setSortDir] = useState("desc");

  
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(8);

  
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [picked, setPicked] = useState([]);
  const [busyAttach, setBusyAttach] = useState(false);
  const [userQuery, setUserQuery] = useState("");

  
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventErr, setEventErr] = useState("");
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", start_time: "", end_time: "" });
  const [creatingEvent, setCreatingEvent] = useState(false);

  
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", assigned_to: "" });
  const [creating, setCreating] = useState(false);

  const canManage = useMemo(() => {
    if (!user || !project) return false;
    if (user.role === "admin") return true;
    if (user.role === "manager" && project.created_by === user.id) return true;
    return false;
  }, [user, project]);

  
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setErr("");
      try {
        const res = await api.get(`/projects/${id}`);
        if (!cancelled) setProject(res.data);
      } catch (e) {
        if (!cancelled) setErr(e?.response?.data?.message || "Failed to load project.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [id]);

  
  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      setTasksLoading(true); setTaskErr("");
      try {
        let res;
        try {
          
          res = await api.get("/tasks", { params: { project_id: id, per_page: 200 } });
          const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
          if (!cancelled) setTasks(items);
        } catch {
          
          const r2 = await api.get("/tasks", { params: { per_page: 200 } });
          const all = Array.isArray(r2.data) ? r2.data : (r2.data?.data || []); 
          const onlyThis = all.filter(t => String(t.project_id) === String(id));
          if (!cancelled) setTasks(onlyThis);
        }
      } catch (e) {
        if (!cancelled) setTaskErr(e?.response?.data?.message || "Failed to load tasks.");
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [id]);

  
  useEffect(() => {
    let cancel = false;
    const loadEv = async () => {
      setEventsLoading(true); setEventErr("");
      try {
        const res = await api.get("/events");
        const all = Array.isArray(res.data) ? res.data : [];
        const list = all.filter(e => String(e.project_id || "") === String(id));
        if (!cancel) setEvents(list.sort((a,b)=> new Date(a.start_time)-new Date(b.start_time)));
      } catch (e) {
        if (!cancel) setEventErr(e?.response?.data?.message || "Failed to load events.");
      } finally {
        if (!cancel) setEventsLoading(false);
      }
    };
    loadEv();
    return () => { cancel = true; };
  }, [id]);

  
  const filteredTasks = useMemo(() => {
    const q = (taskFilter.q || "").toLowerCase();
    const s = taskFilter.status || "";
    return tasks.filter(t => {
      const inQ =
        t.title?.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.user?.name || "").toLowerCase().includes(q);
      const inS = s ? t.status === s : true;
      return inQ && inS;
    });
  }, [tasks, taskFilter]);

  const sortedTasks = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const safe = (v) => (v ?? "");
    const toTime = (v) => (v ? new Date(v).getTime() : 0);
    return [...filteredTasks].sort((a,b) => {
      if (sortKey === "title") return safe(a.title).localeCompare(safe(b.title)) * dir;
      if (sortKey === "status") return safe(a.status).localeCompare(safe(b.status)) * dir;
      if (sortKey === "created_at") return (toTime(a.created_at)-toTime(b.created_at)) * dir;
      if (sortKey === "assignee") return safe(a.user?.name).localeCompare(safe(b.user?.name)) * dir;
      return 0;
    });
  }, [filteredTasks, sortKey, sortDir]);

  
  useEffect(() => { setTaskPage(1); }, [taskFilter, sortKey, sortDir, taskPageSize]);

  const totalSorted = sortedTasks.length;
  const sliceStart = (taskPage - 1) * taskPageSize;
  const pageTasks = useMemo(
    () => sortedTasks.slice(sliceStart, sliceStart + taskPageSize),
    [sortedTasks, sliceStart, taskPageSize]
  );

  
  const openMembers = async () => {
    setPicked(project?.users?.map(u => u.id) || []);
    setShowMembersModal(true);
    setUsersLoading(true);
    setAllUsers([]);
    try {
      const res = await api.get("/users", { params: { per_page: 1000 } });
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setAllUsers(list);
    } catch {
      setAllUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.toLowerCase();
    return allUsers.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      (u.position || "").toLowerCase().includes(q)
    );
  }, [allUsers, userQuery]);

  const togglePick = (uid) => {
    setPicked(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  };

  const attachMembers = async () => {
    if (!project) return;
    setBusyAttach(true);
    try {
      await api.post(`/projects/${project.id}/members`, { user_ids: picked });
      const res = await api.get(`/projects/${project.id}`);
      setProject(res.data);
      setShowMembersModal(false);
      setUserQuery("");
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to attach members. Ensure the backend route exists.";
      alert(msg);
    } finally {
      setBusyAttach(false);
    }
  };

  
  const canCreateTask = canManage;
  const submitCreateTask = async (e) => {
    e?.preventDefault?.();
    if (!project) return;
    setCreating(true);
    try {
      const payload = {
        project_id: Number(project.id),
        title: newTask.title,
        description: newTask.description || "",
        assigned_to: newTask.assigned_to ? Number(newTask.assigned_to) : null,
        status: "todo",
      };
      const { data } = await api.post("/tasks", payload);
      if (String(data.project_id) === String(project.id)) {
        setTasks(prev => [data, ...prev]);
      }
      setShowCreateTask(false);
      setNewTask({ title: "", description: "", assigned_to: "" });
    } catch (e) {
      alert(e?.response?.data?.error || e?.response?.data?.message || "Failed to create task.");
    } finally {
      setCreating(false);
    }
  };

  
  const canCreateEvent = canManage;
  const submitCreateEvent = async (e) => {
    e?.preventDefault?.();
    setCreatingEvent(true);
    try {
      const payload = {
        project_id: Number(id),
        title: newEvent.title,
        description: newEvent.description || "",
        start_time: newEvent.start_time,
        end_time: newEvent.end_time,
      };
      const { data } = await api.post("/events", payload);
      setEvents(prev => [...prev, data].sort((a,b)=> new Date(a.start_time)-new Date(b.start_time)));
      setShowCreateEvent(false);
      setNewEvent({ title:"", description:"", start_time:"", end_time:"" });
    } catch (e) {
      alert(e?.response?.data?.error || e?.response?.data?.message || "Failed to create event");
    } finally {
      setCreatingEvent(false);
    }
  };

  const onTaskUpdated = (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  };

  if (loading) return <div className="container py-4">Loading…</div>;
  if (err) return <div className="container py-4"><div className="alert alert-danger">{err}</div></div>;
  if (!project) return <div className="container py-4"><div className="alert alert-warning">Project not found.</div></div>;

  return (
    <div className="container py-4">
      <Breadcrumbs
        trail={[
          { label: "Projects", to: "/projects" },
          { label: project.name } 
        ]}
      />
      <div className="row g-4">
        {/* MAIN: Tasks */}
        <div className="col-12 col-lg-8">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h4 className="mb-0">🧩 Tasks</h4>
            <div className="d-flex align-items-center gap-2">
              {/* sort controls */}
              <select className="form-select form-select-sm" value={sortKey} onChange={(e)=>setSortKey(e.target.value)}>
                <option value="created_at">Sort: Created</option>
                <option value="title">Sort: Title</option>
                <option value="status">Sort: Status</option>
                <option value="assignee">Sort: Assignee</option>
              </select>
              <select className="form-select form-select-sm" value={sortDir} onChange={(e)=>setSortDir(e.target.value)}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>

              {canCreateTask && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(true)}>
                  + New Task
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="d-flex gap-2 flex-wrap mb-3">
            <input
              className="form-control"
              style={{ maxWidth: 280 }}
              placeholder="Search by title/desc/assignee…"
              value={taskFilter.q}
              onChange={(e) => setTaskFilter({ ...taskFilter, q: e.target.value })}
            />
            <select
              className="form-select"
              style={{ maxWidth: 200 }}
              value={taskFilter.status}
              onChange={(e) => setTaskFilter({ ...taskFilter, status: e.target.value })}
            >
              {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {/* Tasks table + Pagination */}
          {tasksLoading ? (
            <div>Loading tasks…</div>
          ) : taskErr ? (
            <div className="alert alert-danger">{taskErr}</div>
          ) : totalSorted === 0 ? (
            <div className="text-muted">No tasks for this project.</div>
          ) : (
            <>
              <div className="card shadow-sm border-0">
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead>
                      <tr>
                        <th style={{width: "38%"}}>Title</th>
                        <th>Assignee</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th style={{width: 90}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageTasks.map(t => (
                        <tr key={t.id}>
                          <td className="break-word" onClick={()=>setOpenTaskId(t.id)} style={{cursor:"pointer"}}>
                            <div className="fw-semibold">{t.title}</div>
                            <div className="small text-muted line-clamp-2">{t.description || "—"}</div>
                          </td>
                          <td className="small">{t.user?.name || "—"}</td>
                          <td>
                            <span className={`badge text-bg-${
                              t.status==="done"?"success":t.status==="in_progress"?"warning":"secondary"
                            }`}>{t.status}</span>
                          </td>
                          <td className="small text-muted">{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</td>
                          <td className="text-end">
                            <button className="btn btn-sm btn-outline-primary" onClick={()=>setOpenTaskId(t.id)}>Open</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                className="mt-3"
                page={taskPage}
                pageSize={taskPageSize}
                total={totalSorted}
                onPageChange={setTaskPage}
                onPageSizeChange={setTaskPageSize}
                sizes={[5, 8, 12, 20]}
              />
            </>
          )}
        </div>

        {/* SIDEBAR: Info + Members + Events */}
        <div className="col-12 col-lg-4">
          {/* Project info */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-body">
              <h5 className="card-title mb-2">📁 Project</h5>
              <div className="fw-semibold break-word">{project.name}</div>
              <div className="text-muted break-word">{project.description || "—"}</div>
            </div>
          </div>

          {/* Members */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="card-title mb-0">👥 Members</h5>
                <span className="badge text-bg-secondary">{project.users?.length || 0}</span>
              </div>
              {(project.users || []).length === 0 ? (
                <div className="text-muted">No members.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {project.users.map(u => (
                    <li key={u.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div className="break-word">
                        <div className="fw-semibold small">
                          {u.name} <span className="text-muted">· {u.role}</span>
                        </div>
                        <div className="small text-muted">
                          {u.email}{u.position ? ` · ${u.position}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <button className="btn btn-outline-secondary btn-sm mt-3" onClick={openMembers}>
                  Add members
                </button>
              )}
            </div>
          </div>

          {/* Events */}
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="card-title mb-0">🗓️ Events</h5>
                {canCreateEvent && (
                  <button className="btn btn-sm btn-primary" onClick={()=>setShowCreateEvent(true)}>+ New</button>
                )}
              </div>
              {eventsLoading ? (
                <div>Loading events…</div>
              ) : eventErr ? (
                <div className="alert alert-danger">{eventErr}</div>
              ) : events.length === 0 ? (
                <div className="text-muted">No events for this project.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {events.map(ev => (
                    <li key={ev.id} className="list-group-item">
                      <div className="fw-semibold small">{ev.title}</div>
                      <div className="small text-muted">
                        {new Date(ev.start_time).toLocaleString()} – {new Date(ev.end_time).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="modal fade show" style={{ display:"block", background:"rgba(0,0,0,0.35)" }} aria-modal="true" role="dialog">
          <div className="modal-dialog">
            <form className="modal-content" onSubmit={submitCreateTask}>
              <div className="modal-header">
                <h5 className="modal-title">New Task</h5>
                <button type="button" className="btn-close" onClick={()=>setShowCreateTask(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Title</label>
                  <input className="form-control" required value={newTask.title} onChange={(e)=>setNewTask({...newTask, title:e.target.value})}/>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Description</label>
                  <textarea className="form-control" rows={3} value={newTask.description} onChange={(e)=>setNewTask({...newTask, description:e.target.value})}/>
                </div>
                <div className="mb-0">
                  <label className="form-label fw-semibold">Assign to (optional)</label>
                  <select className="form-select" value={newTask.assigned_to} onChange={(e)=>setNewTask({...newTask, assigned_to: e.target.value})}>
                    <option value="">—</option>
                    {(project.users || []).map(u => (
                      <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={()=>setShowCreateTask(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Creating…" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showMembersModal && (
        <div
          className="modal fade show"
          style={{ display: "block", background: "rgba(0,0,0,0.35)" }}
          aria-modal="true"
          role="dialog"
        >
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add members · {project.name}</h5>
                <button type="button" className="btn-close" onClick={()=>setShowMembersModal(false)}></button>
              </div>
              <div className="modal-body">
                {usersLoading ? (
                  <div>Loading users…</div>
                ) : (
                  <>
                    <input
                      className="form-control mb-2"
                      placeholder="Search users…"
                      value={userQuery}
                      onChange={(e)=>setUserQuery(e.target.value)}
                    />
                    <div className="list-group" style={{ maxHeight: 360, overflowY: "auto" }}>
                      {filteredUsers.map(u => (
                        <label key={u.id} className="list-group-item d-flex align-items-center">
                          <input
                            className="form-check-input me-2"
                            type="checkbox"
                            checked={picked.includes(u.id)}
                            onChange={()=>togglePick(u.id)}
                          />
                          <div className="break-word">
                            <div className="fw-semibold small">
                              {u.name} <span className="text-muted">· {u.role}</span>
                            </div>
                            <div className="small text-muted">
                              {u.email}{u.position ? ` · ${u.position}` : ""}
                            </div>
                          </div>
                        </label>
                      ))}
                      {filteredUsers.length === 0 && <div className="text-muted small">No users.</div>}
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={()=>setShowMembersModal(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busyAttach || usersLoading} onClick={attachMembers}>
                  {busyAttach ? "Saving…" : "Save members"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateEvent && (
        <div className="modal fade show" style={{ display:"block", background:"rgba(0,0,0,0.35)" }} aria-modal="true" role="dialog">
          <div className="modal-dialog">
            <form className="modal-content" onSubmit={submitCreateEvent}>
              <div className="modal-header">
                <h5 className="modal-title">New Event</h5>
                <button type="button" className="btn-close" onClick={()=>setShowCreateEvent(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Title</label>
                  <input className="form-control" required value={newEvent.title} onChange={(e)=>setNewEvent({...newEvent, title:e.target.value})}/>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Description</label>
                  <textarea className="form-control" rows={3} value={newEvent.description} onChange={(e)=>setNewEvent({...newEvent, description:e.target.value})}/>
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Start</label>
                    <input type="datetime-local" className="form-control" required value={newEvent.start_time} onChange={(e)=>setNewEvent({...newEvent, start_time:e.target.value})}/>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">End</label>
                    <input type="datetime-local" className="form-control" required value={newEvent.end_time} onChange={(e)=>setNewEvent({...newEvent, end_time:e.target.value})}/>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={()=>setShowCreateEvent(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingEvent}>
                  {creatingEvent ? "Creating…" : "Create event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(showCreateTask || showMembersModal || openTaskId || showCreateEvent) && <div className="modal-backdrop fade show" />}

      {/* Task modal */}
      {openTaskId && <TaskModal taskId={openTaskId} onClose={()=>setOpenTaskId(null)} onUpdated={onTaskUpdated} />}
    </div>
  );
}
