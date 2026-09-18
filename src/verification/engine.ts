import fs from "fs/promises";
import { Task } from "../core/types.js";
import { VerificationCriteria, VerificationEngine, VerificationResult } from "./types.js";

export class DeterministicVerificationEngine implements VerificationEngine {
  private customVerifiers: Map<string, (task: Task, result: string) => Promise<VerificationResult>> = new Map();

  registerCustomVerifier(id: string, verifier: (task: Task, result: string) => Promise<VerificationResult>): void {
    this.customVerifiers.set(id, verifier);
  }

  async verify(task: Task, agentResult: string): Promise<VerificationResult> {
    if (!task.metadata || !task.metadata.verification) {
      // By default, if no strict verification is mapped, we demand an explicit success criteria text
      if (typeof task.metadata?.successCriteria === "string") {
        const criteria = task.metadata.successCriteria.toLowerCase();
        const resultLower = agentResult.toLowerCase();

        if (resultLower.includes(criteria)) {
          return { passed: true };
        }
        return { passed: false, reason: `Result did not contain string: '${criteria}'` };
      }

      // If absolutely no criteria are present, we reluctantly accept completion
      return { passed: true };
    }

    // Process explicit VerificationCriteria
    const criteria = task.metadata.verification as VerificationCriteria | VerificationCriteria[];
    const criteriaList = Array.isArray(criteria) ? criteria : [criteria];

    for (const rule of criteriaList) {
      try {
        switch (rule.type) {
          case "FILE_EXISTS": {
            const filePath = String(rule.value);
            try {
              await fs.stat(filePath);
            } catch (e) {
              return { passed: false, reason: `File does not exist: ${filePath}` };
            }
            break;
          }

          case "EXACT_TEXT": {
            const expectedText = String(rule.value);
            if (!agentResult.includes(expectedText)) {
              return { passed: false, reason: `Expected output to contain: ${expectedText}` };
            }
            break;
          }

          case "SCHEMA_MATCH": {
             // Expecting rule.value to be an array of required keys for naive MVP
             try {
                // Heuristic parsing of JSON from the result
                const match = agentResult.match(/\{.*\}/s);
                if (!match) throw new Error("No JSON object found in output");
                const obj = JSON.parse(match[0]);
                const requiredKeys = rule.value as string[];
                for (const key of requiredKeys) {
                  if (!(key in obj)) return { passed: false, reason: `Schema missing required key: ${key}` };
                }
             } catch (e) {
                return { passed: false, reason: `Schema matching failed: ${(e as Error).message}` };
             }
             break;
          }

          case "CUSTOM": {
            if (!rule.customVerifierId) {
              return { passed: false, reason: `CUSTOM verification requires customVerifierId` };
            }
            const customFunc = this.customVerifiers.get(rule.customVerifierId);
            if (!customFunc) {
              throw new Error(`Custom verifier '${rule.customVerifierId}' not registered in engine`);
            }

            const customResult = await customFunc(task, agentResult);
            if (!customResult.passed) {
               return customResult;
            }
            break;
          }

          default:
            return { passed: false, reason: `Unknown verification type: ${rule.type}` };
        }
      } catch (error) {
         // Verification threw an unhandled error (Test 4 scenario)
         return { passed: false, reason: `Verification execution error: ${(error as Error).message}` };
      }
    }

    return { passed: true };
  }
}
