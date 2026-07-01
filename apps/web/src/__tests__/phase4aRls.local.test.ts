import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const runLocalRlsTests = process.env.RUN_SUPABASE_RLS_TESTS === "1";
const describeLocalRls = runLocalRlsTests ? describe : describe.skip;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const userA = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user_a@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000101",
};

const userB = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "user_b@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000201",
};

function requireAnonKey() {
  if (!supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when RUN_SUPABASE_RLS_TESTS=1. Run `supabase status -o env` and export the local anon key.",
    );
  }

  return supabaseAnonKey;
}

function createLocalClient() {
  return createClient(supabaseUrl, requireAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `lifeos-rls-${Math.random().toString(16).slice(2)}`,
    },
  });
}

async function signIn(email: string, password: string) {
  const client = createLocalClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Could not sign in ${email}: ${error.message}`);
  }

  return client;
}

async function deleteCaptureByText(client: SupabaseClient, rawText: string) {
  const { error } = await client
    .from("capture_items")
    .delete()
    .eq("raw_text", rawText);

  if (error) {
    throw new Error(
      `Could not clean up capture '${rawText}': ${error.message}`,
    );
  }
}

async function deleteTaskByTitle(client: SupabaseClient, title: string) {
  const { error } = await client.from("tasks").delete().eq("title", title);

  if (error) {
    throw new Error(`Could not clean up task '${title}': ${error.message}`);
  }
}

async function deleteProjectByTitle(client: SupabaseClient, title: string) {
  const { error } = await client.from("projects").delete().eq("title", title);

  if (error) {
    throw new Error(`Could not clean up project '${title}': ${error.message}`);
  }
}

async function deleteProposalByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("time_block_proposals")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up proposal for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteBlockByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("calendar_blocks")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up block for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteSessionByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("execution_sessions")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up session for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteReviewByMarker(client: SupabaseClient, marker: string) {
  const { error } = await client
    .from("review_entries")
    .delete()
    .contains("summary_json", { marker });

  if (error) {
    throw new Error(`Could not clean up review '${marker}': ${error.message}`);
  }
}

async function deleteHealthByMarker(client: SupabaseClient, marker: string) {
  const { error } = await client
    .from("health_checks")
    .delete()
    .contains("details_json", { marker });

  if (error) {
    throw new Error(
      `Could not clean up health check '${marker}': ${error.message}`,
    );
  }
}

async function deleteGoogleConnection(client: SupabaseClient) {
  const { error } = await client
    .from("google_calendar_connections")
    .delete()
    .eq("provider", "google_calendar");

  if (error) {
    throw new Error(
      `Could not clean up Google Calendar connection: ${error.message}`,
    );
  }
}

async function deleteExternalWriteByMarker(
  client: SupabaseClient,
  marker: string,
) {
  const { error } = await client
    .from("external_write_events")
    .delete()
    .contains("request_summary_json", { marker });

  if (error) {
    throw new Error(
      `Could not clean up external write event '${marker}': ${error.message}`,
    );
  }
}

describeLocalRls("Phase 4A local Supabase RLS", () => {
  it("lets user A read own areas but not user B areas", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { data, error } = await userAClient
      .from("areas")
      .select("id,user_id,name,slug")
      .order("sort_order", { ascending: true });

    expect(error).toBeNull();
    expect(data?.some((area) => area.user_id === userA.id)).toBe(true);
    expect(data?.some((area) => area.id === userB.areaId)).toBe(false);
    expect(data?.every((area) => area.user_id === userA.id)).toBe(true);
  });

  it("denies authenticated hard deletes for areas", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { data, error } = await userAClient
      .from("areas")
      .delete()
      .eq("id", userA.areaId);

    expectDenied(data, error);
  });

  it("denies unauthenticated anon reads for areas and capture_items", async () => {
    const anonClient = createLocalClient();

    const { data: areas, error: areasError } = await anonClient
      .from("areas")
      .select("id");
    const { data: captures, error: capturesError } = await anonClient
      .from("capture_items")
      .select("id");
    const { data: connections, error: connectionsError } = await anonClient
      .from("google_calendar_connections")
      .select("id");
    const { data: externalWrites, error: externalWritesError } =
      await anonClient.from("external_write_events").select("id");

    expectDenied(areas, areasError);
    expectDenied(captures, capturesError);
    expectDenied(connections, connectionsError);
    expectDenied(externalWrites, externalWritesError);
  });

  it("lets user A access own capture_items but not user B capture_items", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userARawText = `rls-user-a-${suffix}`;
    const userBRawText = `rls-user-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("capture_items")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          raw_text: userARawText,
          capture_mode: "text",
          status: "new",
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("capture_items")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          raw_text: userBRawText,
          capture_mode: "text",
          status: "new",
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("capture_items")
        .select("user_id,raw_text")
        .in("raw_text", [userARawText, userBRawText])
        .order("raw_text", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, raw_text: userARawText },
      ]);
    } finally {
      await deleteCaptureByText(userAClient, userARawText);
      await deleteCaptureByText(userBClient, userBRawText);
    }
  });

  it("prevents user A from inserting capture_items for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const rawText = `rls-cross-user-insert-${Date.now()}`;

    const { error } = await userAClient.from("capture_items").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      raw_text: rawText,
      capture_mode: "text",
      status: "new",
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A access own tasks and projects but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-task-${suffix}`;
    const userAProjectTitle = `rls-user-a-project-${suffix}`;
    const userBProjectTitle = `rls-user-b-project-${suffix}`;

    try {
      const { error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        });
      expect(insertATaskError).toBeNull();

      const { error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        });
      expect(insertBTaskError).toBeNull();

      const { error: insertAProjectError } = await userAClient
        .from("projects")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userAProjectTitle,
          status: "active",
        });
      expect(insertAProjectError).toBeNull();

      const { error: insertBProjectError } = await userBClient
        .from("projects")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBProjectTitle,
          status: "active",
        });
      expect(insertBProjectError).toBeNull();

      const { data: visibleTasksToA, error: selectTasksAError } =
        await userAClient
          .from("tasks")
          .select("user_id,title")
          .in("title", [userATaskTitle, userBTaskTitle])
          .order("title", { ascending: true });
      expect(selectTasksAError).toBeNull();
      expect(visibleTasksToA).toEqual([
        { user_id: userA.id, title: userATaskTitle },
      ]);

      const { data: visibleProjectsToA, error: selectProjectsAError } =
        await userAClient
          .from("projects")
          .select("user_id,title")
          .in("title", [userAProjectTitle, userBProjectTitle])
          .order("title", { ascending: true });
      expect(selectProjectsAError).toBeNull();
      expect(visibleProjectsToA).toEqual([
        { user_id: userA.id, title: userAProjectTitle },
      ]);
    } finally {
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
      await deleteProjectByTitle(userAClient, userAProjectTitle);
      await deleteProjectByTitle(userBClient, userBProjectTitle);
    }
  });

  it("prevents user A from inserting tasks and projects for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error: taskError } = await userAClient.from("tasks").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      title: `rls-cross-user-task-${suffix}`,
      status: "active",
    });

    const { error: projectError } = await userAClient.from("projects").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      title: `rls-cross-user-project-${suffix}`,
      status: "active",
    });

    expect(taskError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(projectError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("lets user A access own proposals and blocks but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-planning-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-planning-task-${suffix}`;
    let userATaskId = "";
    let userBTaskId = "";

    try {
      const { data: insertedATask, error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertATaskError).toBeNull();
      userATaskId = insertedATask!.id;

      const { data: insertedBTask, error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertBTaskError).toBeNull();
      userBTaskId = insertedBTask!.id;

      const { data: proposalA, error: insertProposalAError } = await userAClient
        .from("time_block_proposals")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: userATaskId,
          proposed_start: "2026-05-08T16:00:00.000Z",
          proposed_end: "2026-05-08T17:00:00.000Z",
          rationale_json: { note: "RLS user A" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(insertProposalAError).toBeNull();

      const { data: proposalB, error: insertProposalBError } = await userBClient
        .from("time_block_proposals")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          task_id: userBTaskId,
          proposed_start: "2026-05-08T18:00:00.000Z",
          proposed_end: "2026-05-08T19:00:00.000Z",
          rationale_json: { note: "RLS user B" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(insertProposalBError).toBeNull();

      const { error: insertBlockAError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          proposal_id: proposalA!.id,
          task_id: userATaskId,
          start_at: "2026-05-08T16:00:00.000Z",
          end_at: "2026-05-08T17:00:00.000Z",
          status: "scheduled",
        });
      expect(insertBlockAError).toBeNull();

      const { error: insertBlockBError } = await userBClient
        .from("calendar_blocks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          proposal_id: proposalB!.id,
          task_id: userBTaskId,
          start_at: "2026-05-08T18:00:00.000Z",
          end_at: "2026-05-08T19:00:00.000Z",
          status: "scheduled",
        });
      expect(insertBlockBError).toBeNull();

      const { data: visibleProposalsToA, error: selectProposalAError } =
        await userAClient
          .from("time_block_proposals")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectProposalAError).toBeNull();
      expect(visibleProposalsToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);

      const { data: visibleBlocksToA, error: selectBlockAError } =
        await userAClient
          .from("calendar_blocks")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectBlockAError).toBeNull();
      expect(visibleBlocksToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);
    } finally {
      if (userATaskId) {
        await deleteBlockByTaskId(userAClient, userATaskId);
        await deleteProposalByTaskId(userAClient, userATaskId);
      }
      if (userBTaskId) {
        await deleteBlockByTaskId(userBClient, userBTaskId);
        await deleteProposalByTaskId(userBClient, userBTaskId);
      }
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
    }
  });

  it("prevents user A from inserting or updating user B planning rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: insertProposalError } = await userAClient
      .from("time_block_proposals")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        proposed_start: "2026-05-08T16:00:00.000Z",
        proposed_end: "2026-05-08T17:00:00.000Z",
        rationale_json: { note: "cross-user" },
        conflict_flag: false,
        status: "proposed",
      });

    const { error: insertBlockError } = await userAClient
      .from("calendar_blocks")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        start_at: "2026-05-08T16:00:00.000Z",
        end_at: "2026-05-08T17:00:00.000Z",
        status: "scheduled",
      });

    expect(insertProposalError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(insertBlockError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("accepts proposals atomically via rpc and hides cross-user proposals", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-accept-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: proposal, error: proposalError } = await userAClient
        .from("time_block_proposals")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          proposed_start: "2026-06-12T16:00:00.000Z",
          proposed_end: "2026-06-12T17:00:00.000Z",
          rationale_json: { note: "RLS rpc accept" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(proposalError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: accepted, error: acceptError } = await userAClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(acceptError).toBeNull();
      expect(accepted.proposal.status).toBe("accepted");
      expect(accepted.block.proposal_id).toBe(proposal!.id);
      expect(accepted.block.user_id).toBe(userA.id);
      expect(accepted.block.status).toBe("scheduled");
      expect(accepted.task.status).toBe("scheduled");

      const { error: repeatError } = await userAClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(repeatError?.message).toMatch(
        /only proposed or edited proposals/i,
      );
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
        await deleteProposalByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("applies execution outcomes atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-outcome-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: session, error: sessionError } = await userAClient
        .from("execution_sessions")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          outcome: "partial",
        })
        .select("id")
        .single();
      expect(sessionError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "apply_execution_session_outcome",
        {
          p_session_id: session!.id,
          p_outcome: "completed",
          p_actual_minutes: 30,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 4,
          p_notes: "cross-user attempt",
        },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: applied, error: applyError } = await userAClient.rpc(
        "apply_execution_session_outcome",
        {
          p_session_id: session!.id,
          p_outcome: "completed",
          p_actual_minutes: 30,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 4,
          p_notes: "RLS rpc outcome",
        },
      );
      expect(applyError).toBeNull();
      expect(applied.session.outcome).toBe("completed");
      expect(applied.session.actual_minutes).toBe(30);
      expect(applied.task.status).toBe("done");
      expect(applied.block).toBeNull();
    } finally {
      if (taskId) {
        await deleteSessionByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("starts execution sessions atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-start-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: block, error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T18:00:00.000Z",
          end_at: "2026-06-12T18:45:00.000Z",
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "start_execution_session",
        { p_task_id: taskId, p_calendar_block_id: block!.id },
      );
      expect(crossUserError?.message).toMatch(/task was not found/i);

      const { data: started, error: startError } = await userAClient.rpc(
        "start_execution_session",
        { p_task_id: taskId, p_calendar_block_id: block!.id },
      );
      expect(startError).toBeNull();
      expect(started.session.outcome).toBe("partial");
      expect(started.session.planned_minutes).toBe(45);
      expect(started.block.status).toBe("running");
    } finally {
      if (taskId) {
        await deleteSessionByTaskId(userAClient, taskId);
        await deleteBlockByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("unplans local blocks atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-unplan-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: block, error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T19:00:00.000Z",
          end_at: "2026-06-12T20:00:00.000Z",
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "unplan_calendar_block",
        { p_block_id: block!.id },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: unplanned, error: unplanError } = await userAClient.rpc(
        "unplan_calendar_block",
        { p_block_id: block!.id },
      );
      expect(unplanError).toBeNull();
      expect(unplanned.block.status).toBe("cancelled");
      expect(unplanned.task.status).toBe("active");
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("applies review task transitions atomically and refuses Google-backed blocks", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-review-task-${suffix}`;
    const googleTaskTitle = `rls-rpc-review-google-task-${suffix}`;
    let taskId = "";
    let googleTaskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T21:00:00.000Z",
          end_at: "2026-06-12T22:00:00.000Z",
          status: "scheduled",
        });
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "apply_task_review_transition",
        { p_task_id: taskId, p_target_status: "backlog" },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: transitioned, error: transitionError } =
        await userAClient.rpc("apply_task_review_transition", {
          p_task_id: taskId,
          p_target_status: "backlog",
        });
      expect(transitionError).toBeNull();
      expect(transitioned.task.status).toBe("backlog");
      expect(transitioned.blocks).toHaveLength(1);
      expect(transitioned.blocks[0].status).toBe("cancelled");

      const { data: googleTask, error: googleTaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: googleTaskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(googleTaskError).toBeNull();
      googleTaskId = googleTask!.id;

      const { error: googleBlockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: googleTaskId,
          google_event_id: `evt-${suffix}`,
          start_at: "2026-06-13T21:00:00.000Z",
          end_at: "2026-06-13T22:00:00.000Z",
          status: "scheduled",
        });
      expect(googleBlockError).toBeNull();

      const { error: googleGuardError } = await userAClient.rpc(
        "apply_task_review_transition",
        { p_task_id: googleTaskId, p_target_status: "dropped" },
      );
      expect(googleGuardError?.message).toMatch(
        /google-backed blocks require calendar approval/i,
      );
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
      }
      if (googleTaskId) {
        await deleteBlockByTaskId(userAClient, googleTaskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
      await deleteTaskByTitle(userAClient, googleTaskTitle);
    }
  });

  it("lets user A access own execution sessions and review entries but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-execution-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-execution-task-${suffix}`;
    const userAReviewMarker = `rls-user-a-review-${suffix}`;
    const userBReviewMarker = `rls-user-b-review-${suffix}`;
    let userATaskId = "";
    let userBTaskId = "";
    let userABlockId = "";
    let userBBlockId = "";

    try {
      const { data: insertedATask, error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertATaskError).toBeNull();
      userATaskId = insertedATask!.id;

      const { data: insertedBTask, error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertBTaskError).toBeNull();
      userBTaskId = insertedBTask!.id;

      const { data: insertedABlock, error: insertBlockAError } =
        await userAClient
          .from("calendar_blocks")
          .insert({
            user_id: userA.id,
            area_id: userA.areaId,
            task_id: userATaskId,
            start_at: "2026-05-08T16:00:00.000Z",
            end_at: "2026-05-08T17:00:00.000Z",
            status: "scheduled",
          })
          .select("id")
          .single();
      expect(insertBlockAError).toBeNull();
      userABlockId = insertedABlock!.id;

      const { data: insertedBBlock, error: insertBlockBError } =
        await userBClient
          .from("calendar_blocks")
          .insert({
            user_id: userB.id,
            area_id: userB.areaId,
            task_id: userBTaskId,
            start_at: "2026-05-08T18:00:00.000Z",
            end_at: "2026-05-08T19:00:00.000Z",
            status: "scheduled",
          })
          .select("id")
          .single();
      expect(insertBlockBError).toBeNull();
      userBBlockId = insertedBBlock!.id;

      const { error: insertSessionAError } = await userAClient
        .from("execution_sessions")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: userATaskId,
          calendar_block_id: userABlockId,
          planned_minutes: 60,
          paused_minutes: 0,
          distraction_minutes: 0,
          outcome: "partial",
        });
      expect(insertSessionAError).toBeNull();

      const { error: insertSessionBError } = await userBClient
        .from("execution_sessions")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          task_id: userBTaskId,
          calendar_block_id: userBBlockId,
          planned_minutes: 60,
          paused_minutes: 0,
          distraction_minutes: 0,
          outcome: "partial",
        });
      expect(insertSessionBError).toBeNull();

      const { error: insertReviewAError } = await userAClient
        .from("review_entries")
        .insert({
          user_id: userA.id,
          area_id: null,
          review_type: "daily",
          period_start: "2026-05-08",
          period_end: "2026-05-08",
          summary_json: { marker: userAReviewMarker },
        });
      expect(insertReviewAError).toBeNull();

      const { error: insertReviewBError } = await userBClient
        .from("review_entries")
        .insert({
          user_id: userB.id,
          area_id: null,
          review_type: "daily",
          period_start: "2026-05-08",
          period_end: "2026-05-08",
          summary_json: { marker: userBReviewMarker },
        });
      expect(insertReviewBError).toBeNull();

      const { data: visibleSessionsToA, error: selectSessionAError } =
        await userAClient
          .from("execution_sessions")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectSessionAError).toBeNull();
      expect(visibleSessionsToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);

      const { data: visibleReviewsToA, error: selectReviewAError } =
        await userAClient
          .from("review_entries")
          .select("user_id,summary_json")
          .contains("summary_json", { marker: userAReviewMarker });
      expect(selectReviewAError).toBeNull();
      expect(visibleReviewsToA).toEqual([
        { user_id: userA.id, summary_json: { marker: userAReviewMarker } },
      ]);
    } finally {
      if (userATaskId) {
        await deleteSessionByTaskId(userAClient, userATaskId);
        await deleteBlockByTaskId(userAClient, userATaskId);
      }
      if (userBTaskId) {
        await deleteSessionByTaskId(userBClient, userBTaskId);
        await deleteBlockByTaskId(userBClient, userBTaskId);
      }
      await deleteReviewByMarker(userAClient, userAReviewMarker);
      await deleteReviewByMarker(userBClient, userBReviewMarker);
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
    }
  });

  it("prevents user A from inserting execution and review rows for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const { error: insertSessionError } = await userAClient
      .from("execution_sessions")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        calendar_block_id: null,
        planned_minutes: 60,
        paused_minutes: 0,
        distraction_minutes: 0,
        outcome: "partial",
      });

    const { error: insertReviewError } = await userAClient
      .from("review_entries")
      .insert({
        user_id: userB.id,
        area_id: null,
        review_type: "daily",
        period_start: "2026-05-08",
        period_end: "2026-05-08",
        summary_json: { marker: "cross-user" },
      });

    expect(insertSessionError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(insertReviewError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("lets user A access own health checks but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAMarker = `rls-user-a-health-${suffix}`;
    const userBMarker = `rls-user-b-health-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("health_checks")
        .insert({
          user_id: userA.id,
          area_id: null,
          subsystem: "Phase 4E RLS user A",
          status: "healthy",
          score: 100,
          details_json: { marker: userAMarker },
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("health_checks")
        .insert({
          user_id: userB.id,
          area_id: null,
          subsystem: "Phase 4E RLS user B",
          status: "watch",
          score: 50,
          details_json: { marker: userBMarker },
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("health_checks")
        .select("user_id,details_json")
        .in("subsystem", ["Phase 4E RLS user A", "Phase 4E RLS user B"])
        .order("subsystem", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, details_json: { marker: userAMarker } },
      ]);
    } finally {
      await deleteHealthByMarker(userAClient, userAMarker);
      await deleteHealthByMarker(userBClient, userBMarker);
    }
  });

  it("prevents user A from inserting health checks for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error } = await userAClient.from("health_checks").insert({
      user_id: userB.id,
      area_id: null,
      subsystem: "Phase 4E cross-user health",
      status: "critical",
      score: 0,
      details_json: { marker: "cross-user" },
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("prevents authenticated clients from reading Google token ciphertext columns", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: safeMetadataError } = await userAClient
      .from("google_calendar_connections")
      .select("user_id,provider,status,calendar_id")
      .eq("provider", "google_calendar");
    expect(safeMetadataError).toBeNull();

    const { error: tokenColumnError } = await userAClient
      .from("google_calendar_connections")
      .select("encrypted_access_token,encrypted_refresh_token")
      .eq("provider", "google_calendar");
    expect(tokenColumnError?.message).toMatch(/permission denied/i);
  });

  it("prevents authenticated clients from inserting Google Calendar token and audit rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: connectionError } = await userAClient
      .from("google_calendar_connections")
      .insert({
        user_id: userA.id,
        provider: "google_calendar",
        calendar_id: "primary",
        encrypted_access_token: "encrypted-user-a-access-token",
        encrypted_refresh_token: "encrypted-user-a-refresh-token",
        granted_scopes_json: [],
        status: "metadata_only",
        token_expires_at: "2026-05-09T01:00:00.000Z",
        token_type: "Bearer",
      });

    const { error: auditError } = await userAClient
      .from("external_write_events")
      .insert({
        user_id: userA.id,
        area_id: null,
        provider: "google_calendar",
        operation: "events.insert",
        target_type: "calendar_block",
        target_id: null,
        request_summary_json: { marker: "cross-user" },
        result_summary_json: {},
        result_status: "failed",
        error_message: "cross-user",
      });

    expect(connectionError?.message).toMatch(/permission denied/i);
    expect(auditError?.message).toMatch(/permission denied/i);
  });
});

function expectDenied(data: unknown[] | null, error: { code?: string } | null) {
  if (error) {
    expect(["42501", "PGRST301"]).toContain(error.code);
    return;
  }

  expect(data).toEqual([]);
}
