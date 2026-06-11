# Architecture (react-driller)

Main work is done in a queue

To populate the queue we run the document node sequentially until we hit a literal "useState" (super brittle but fine for early)

    Mark the usage via bitwise flags (e.g. is the getter read/ used, is the setter read/used, or are one or both merely passed as props to the component)

    If the latter, detect the JSX component tied to it, jump to the JSX component, match on the identifier and parameter, add to set list for getter or setter respectively. Create node linked to the parent and enqueue.

    Continue to end of the file

Next:
dequeue and do the same as the above with no difference:

     Mark the usage via bitwise flags (e.g. is the getter read/ used, is the setter read/used, or are one or both merely passed as props to the component)

    If the latter, detect the JSX component tied to it, jump to the JSX component, match on the identifier and parameter, add to set list for getter or setter respectively. Create node linked to the parent and enqueue.

    Continue to end of the file

Todo:

file traversions
hardening for MANY edge cases (too numerous currently)
