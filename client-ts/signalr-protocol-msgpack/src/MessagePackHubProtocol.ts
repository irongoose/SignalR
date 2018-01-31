// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the Apache License, Version 2.0. See License.txt in the project root for license information.

import { CompletionMessage, HubMessage, IHubProtocol, InvocationMessage, MessageType, ProtocolType, ResultMessage, StreamInvocationMessage } from "@aspnet/signalr";
import { Buffer } from "buffer";
import * as msgpack5 from "msgpack5";
import { BinaryMessageFormat } from "./BinaryMessageFormat";

export class MessagePackHubProtocol implements IHubProtocol {

    public readonly name: string = "messagepack";

    public readonly type: ProtocolType = ProtocolType.Binary;

    public parseMessages(input: ArrayBuffer): HubMessage[] {
        return BinaryMessageFormat.parse(input).map((m) => this.parseMessage(m));
    }

    private parseMessage(input: Uint8Array): HubMessage {
        if (input.length === 0) {
            throw new Error("Invalid payload.");
        }

        const msgpack = msgpack5();
        const properties = msgpack.decode(new Buffer(input));
        if (properties.length === 0 || !(properties instanceof Array)) {
            throw new Error("Invalid payload.");
        }

        const messageType = properties[0] as MessageType;
        switch (messageType) {
            case MessageType.Invocation:
                return this.createInvocationMessage(properties);
            case MessageType.StreamItem:
                return this.createStreamItemMessage(properties);
            case MessageType.Completion:
                return this.createCompletionMessage(properties);
            case MessageType.Ping:
                return this.createPingMessage(properties);
            default:
                throw new Error("Invalid message type.");
        }
    }

    private createPingMessage(properties: any[]): HubMessage {
        if (properties.length !== 1) {
            throw new Error("Invalid payload for Ping message.");
        }

        return {
            type: properties[0],
        } as HubMessage;
    }

    private createInvocationMessage(properties: any[]): InvocationMessage {
        if (properties.length !== 4) {
            throw new Error("Invalid payload for Invocation message.");
        }

        const invocationId = properties[1];
        if (invocationId) {
            return {
                arguments: properties[3],
                invocationId,
                target: properties[2],
                type: MessageType.Invocation,
            } as InvocationMessage;
        } else {
            return {
                arguments: properties[3],
                target: properties[2],
                type: MessageType.Invocation,
            } as InvocationMessage;
        }

    }

    private createStreamItemMessage(properties: any[]): ResultMessage {
        if (properties.length !== 3) {
            throw new Error("Invalid payload for stream Result message.");
        }

        return {
            invocationId: properties[1],
            item: properties[2],
            type: MessageType.StreamItem,
        } as ResultMessage;
    }

    private createCompletionMessage(properties: any[]): CompletionMessage {
        if (properties.length < 3) {
            throw new Error("Invalid payload for Completion message.");
        }

        const errorResult = 1;
        const voidResult = 2;
        const nonVoidResult = 3;

        const resultKind = properties[2];

        if ((resultKind === voidResult && properties.length !== 3) ||
            (resultKind !== voidResult && properties.length !== 4)) {
            throw new Error("Invalid payload for Completion message.");
        }

        const completionMessage = {
            error: null as string,
            invocationId: properties[1],
            result: null as any,
            type: MessageType.Completion,
        };

        switch (resultKind) {
            case errorResult:
                completionMessage.error = properties[3];
                break;
            case nonVoidResult:
                completionMessage.result = properties[3];
                break;
        }

        return completionMessage as CompletionMessage;
    }

    public writeMessage(message: HubMessage): ArrayBuffer {
        switch (message.type) {
            case MessageType.Invocation:
                return this.writeInvocation(message as InvocationMessage);
            case MessageType.StreamInvocation:
                return this.writeStreamInvocation(message as StreamInvocationMessage);
            case MessageType.StreamItem:
            case MessageType.Completion:
                throw new Error(`Writing messages of type '${message.type}' is not supported.`);
            default:
                throw new Error("Invalid message type.");
        }
    }

    private writeInvocation(invocationMessage: InvocationMessage): ArrayBuffer {
        const msgpack = msgpack5();
        const payload = msgpack.encode([MessageType.Invocation, invocationMessage.invocationId || null,
        invocationMessage.target, invocationMessage.arguments]);

        return BinaryMessageFormat.write(payload.slice());
    }

    private writeStreamInvocation(streamInvocationMessage: StreamInvocationMessage): ArrayBuffer {
        const msgpack = msgpack5();
        const payload = msgpack.encode([MessageType.StreamInvocation, streamInvocationMessage.invocationId,
        streamInvocationMessage.target, streamInvocationMessage.arguments]);

        return BinaryMessageFormat.write(payload.slice());
    }
}
