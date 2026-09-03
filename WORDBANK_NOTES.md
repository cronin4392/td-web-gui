1. I'm inclined to do a call. Let's discuss the downsides of using a call rather than params though to make sure I don't encounter any pitfalls.
2. Some things had been using named tables but I'm moving off of those. Future state is to read indexed rows.
3. Drop-in and it should be straight forward. I can handle any changes upstream I think and have the final dat that I use to read the values stay the same.
4. All scenes are pulling their text from a dat in Inputs. I'm not fully understanding your question and what it's getting at.
5. Yes, clearScene resets the layer's overrides back to defaults, just like it's doing today. Do you disagree?
6. What does this question have to do with this feature? Are you trying to ask what should populate in the scene's text if no web is present?
7. I'm on the fence. I do want them to survive reloads but it's also not that big of a deal. I'd rather not over architect the call transport solution to work with surviving reloads. If there is an elegant way to handle this then I'd like to.
8. /GUI/ExternalScenes/Scene* proxy comps do not go away entirely, they are doing other things. But to answer your question, Inputs.toe is not involved here.
