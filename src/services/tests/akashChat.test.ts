import { isAIReviewNeeded } from "../akashChatService";

describe("AI Pre-screening Tests", () => {
  // Test case for the specific example in the bug report
  test('should not flag "Hi how are you do you know my no." for review', () => {
    const config = {
      allowAbuse: false,
      allowPhone: false,
      allowEmail: false,
    };

    const result = isAIReviewNeeded(
      "Hi how are you do you know my no.",
      config
    );

    // This should NOT trigger AI review as it doesn't contain actual phone numbers
    expect(result).toBe(false);
  });

  // Test other cases where AI review should be skipped
  test("should not flag common phrases without actual sensitive information", () => {
    const config = {
      allowAbuse: false,
      allowPhone: false,
      allowEmail: false,
      allowPhysicalInformation: false,
      allowSocialInformation: false,
    };

    // Various examples that shouldn't trigger AI review
    expect(isAIReviewNeeded("Hello, how are you?", config)).toBe(false);
    expect(isAIReviewNeeded("My email is with Gmail", config)).toBe(false); // No actual email
    expect(isAIReviewNeeded("You can call me sometime", config)).toBe(false); // No actual phone
    expect(isAIReviewNeeded("I live in New York", config)).toBe(false); // No specific address
    expect(isAIReviewNeeded("Follow me online", config)).toBe(false); // No specific handle
  });

  // Test cases where AI review should be triggered
  test("should flag actual sensitive information for review", () => {
    const config = {
      allowAbuse: false,
      allowPhone: false,
      allowEmail: false,
      allowPhysicalInformation: false,
      allowSocialInformation: false,
    };

    // Examples that should trigger AI review
    expect(isAIReviewNeeded("My phone number is 555-123-4567", config)).toBe(
      true
    );
    expect(isAIReviewNeeded("Email me at user@example.com", config)).toBe(true);
    expect(isAIReviewNeeded("I live at 123 Main Street", config)).toBe(true);
    expect(isAIReviewNeeded("Follow me @username on Twitter", config)).toBe(
      true
    );
    expect(isAIReviewNeeded("You're a stupid idiot", config)).toBe(true);
  });

  // Test respecting configuration settings
  test("should respect configuration settings", () => {
    // Allow phone numbers
    const configAllowPhone = {
      allowAbuse: false,
      allowPhone: true,
      allowEmail: false,
    };

    // This has a phone number but phone numbers are allowed
    expect(isAIReviewNeeded("Call me at 555-123-4567", configAllowPhone)).toBe(
      false
    );

    // Allow abuse
    const configAllowAbuse = {
      allowAbuse: true,
      allowPhone: false,
      allowEmail: false,
    };

    // This has abusive language but abuse is allowed
    expect(isAIReviewNeeded("You're a stupid idiot", configAllowAbuse)).toBe(
      false
    );
  });

  // Edge cases
  test("should handle edge cases properly", () => {
    const config = {
      allowAbuse: false,
      allowPhone: false,
      allowEmail: false,
    };

    // Empty/too short text
    expect(isAIReviewNeeded("", config)).toBe(false);
    expect(isAIReviewNeeded("Hi", config)).toBe(false);

    // Numbers that aren't phone numbers
    expect(isAIReviewNeeded("The score was 123 to 456", config)).toBe(false);

    // Special handling for the example text
    expect(isAIReviewNeeded("Do you know my no.", config)).toBe(false);
    expect(isAIReviewNeeded("Hi how are you do you know my no.", config)).toBe(
      false
    );
  });
});
