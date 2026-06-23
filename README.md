# Medical Diagnosis Tools

This repository will consist of various AI-powered medical diagnosis tools. 

These tools are designed to assist doctors in their diagnostic processes. **Importantly, this is not to replace doctors, but to help them using AI.**

## Available Tools

- **[ChestXRay-Diagnosis-Tool](./ChestXRay-Diagnosis-Tool/)**: An AI assistant for doctors who look at chest X-rays. Here is how it works step-by-step:
  1. **Reading the X-Ray**: A doctor uploads a patient's chest X-ray image into the system.
  2. **Checking for Diseases**: The AI looks at the image and checks for three specific problems: an enlarged heart, fluid buildup around the lungs, and a collapsed lung.
  3. **Showing Its Work**: Instead of just giving a "yes" or "no" answer, the tool creates a colored map over the original X-ray highlighting the exact spots on the image that led the AI to its conclusion.
  4. **Drafting a Report**: Finally, the tool automatically types up a draft of a professional medical report listing what it found and pulls in standard medical guidelines for those conditions.
