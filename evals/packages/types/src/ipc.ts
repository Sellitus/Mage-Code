import { z } from "zod"

import { MageCodeEventName, magecodeEventsSchema, magecodeSettingsSchema } from "./mage-code.js"

/**
 * Ack
 */

export const ackSchema = z.object({
	clientId: z.string(),
	pid: z.number(),
	ppid: z.number(),
})

export type Ack = z.infer<typeof ackSchema>

/**
 * TaskCommand
 */

export enum TaskCommandName {
	StartNewTask = "StartNewTask",
	CancelTask = "CancelTask",
	CloseTask = "CloseTask",
}

export const taskCommandSchema = z.discriminatedUnion("commandName", [
	z.object({
		commandName: z.literal(TaskCommandName.StartNewTask),
		data: z.object({
			configuration: magecodeSettingsSchema,
			text: z.string(),
			images: z.array(z.string()).optional(),
			newTab: z.boolean().optional(),
		}),
	}),
	z.object({
		commandName: z.literal(TaskCommandName.CancelTask),
		data: z.string(),
	}),
	z.object({
		commandName: z.literal(TaskCommandName.CloseTask),
		data: z.string(),
	}),
])

export type TaskCommand = z.infer<typeof taskCommandSchema>

/**
 * TaskEvent
 */

export const taskEventSchema = z.discriminatedUnion("eventName", [
	z.object({
		eventName: z.literal(MageCodeEventName.Connect),
		payload: z.unknown(),
		taskId: z.number(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.Message),
		payload: magecodeEventsSchema.shape[MageCodeEventName.Message],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskCreated),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskCreated],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskStarted),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskModeSwitched),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskModeSwitched],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskPaused),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskPaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskUnpaused),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskUnpaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskAskResponded),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskAskResponded],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskAborted),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskAborted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskSpawned),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskCompleted),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MageCodeEventName.TaskTokenUsageUpdated),
		payload: magecodeEventsSchema.shape[MageCodeEventName.TaskTokenUsageUpdated],
		taskId: z.number().optional(),
	}),
])

export type TaskEvent = z.infer<typeof taskEventSchema>

/**
 * IpcMessage
 */

export enum IpcMessageType {
	Connect = "Connect",
	Disconnect = "Disconnect",
	Ack = "Ack",
	TaskCommand = "TaskCommand",
	TaskEvent = "TaskEvent",
}

export enum IpcOrigin {
	Client = "client",
	Server = "server",
}

export const ipcMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal(IpcMessageType.Ack),
		origin: z.literal(IpcOrigin.Server),
		data: ackSchema,
	}),
	z.object({
		type: z.literal(IpcMessageType.TaskCommand),
		origin: z.literal(IpcOrigin.Client),
		clientId: z.string(),
		data: taskCommandSchema,
	}),
	z.object({
		type: z.literal(IpcMessageType.TaskEvent),
		origin: z.literal(IpcOrigin.Server),
		relayClientId: z.string().optional(),
		data: taskEventSchema,
	}),
])

export type IpcMessage = z.infer<typeof ipcMessageSchema>
