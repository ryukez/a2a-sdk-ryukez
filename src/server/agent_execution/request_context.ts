import {
    Message,
    Task,
} from "../../types.js";

export class RequestContext {
    public readonly userMessage: Message;
    public readonly task?: Task;
    public readonly referenceTasks?: Task[];

    constructor(
        userMessage: Message,
        task?: Task,
        referenceTasks?: Task[]
    ) {
        this.userMessage = userMessage;
        this.task = task;
        this.referenceTasks = referenceTasks;
    }
}