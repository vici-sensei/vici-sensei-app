-- Appends a pointer to the character grid that follows the intro rule card, so a first-time
-- reader knows what's coming next on the page.

update public.hiragana
set notes = notes || ' Below, you''ll find the full list of hiragana characters, each one shown with its pronunciation.'
where gojuon_row = 'seion_rule';

update public.katakana
set notes = notes || ' Below, you''ll find the full list of katakana characters, each one shown with its pronunciation.'
where gojuon_row = 'seion_rule';
